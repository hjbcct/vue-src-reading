import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
  isFunction
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget, DepTarget } from './dep'
import { DebuggerEvent, DebuggerOptions } from 'v3/debug'

import type { SimpleSet } from '../util/index'
import type { Component } from 'types/component'
import { activeEffectScope, recordEffectScope } from 'v3/reactivity/effectScope'

let uid = 0

/**
 * @internal
 */
export interface WatcherOptions extends DebuggerOptions {
  deep?: boolean
  user?: boolean
  lazy?: boolean
  sync?: boolean
  before?: Function
}

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * @internal
 */
export default class Watcher implements DepTarget {
  vm?: Component | null
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean
  sync: boolean
  dirty: boolean
  active: boolean
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before?: Function
  onStop?: Function
  noRecurse?: boolean
  getter: Function
  value: any
  post: boolean

  // dev only
  onTrack?: ((event: DebuggerEvent) => void) | undefined
  onTrigger?: ((event: DebuggerEvent) => void) | undefined

  constructor(
    vm: Component | null,
    expOrFn: string | (() => any),
    cb: Function,
    options?: WatcherOptions | null,
    isRenderWatcher?: boolean
  ) {
    recordEffectScope(
      this,
      // if the active effect scope is manually created (not a component scope),
      // prioritize it
      activeEffectScope && !activeEffectScope._vm
        ? activeEffectScope
        : vm
        ? vm._scope
        : undefined
    )
    if ((this.vm = vm) && isRenderWatcher) {
      vm._watcher = this
    }
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
      if (__DEV__) {
        this.onTrack = options.onTrack
        this.onTrigger = options.onTrigger
      }
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.post = false
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = __DEV__ ? expOrFn.toString() : ''
    // parse expression for getter
    if (isFunction(expOrFn)) {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        __DEV__ &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              'Watcher only accepts simple dot-delimited paths. ' +
              'For full control, use a function instead.',
            vm
          )
      }
    }
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  //  get方法进行的是一个初始化操作
  //  之后如果数据发生变化，触发watcher.update方法，而update又会触发watcher.get方法，进而再次运行render这一观察者函数，实现视图更新
  get() {
    ///////////////////////////
    //  1.  将this（watch）赋值给Dep.target, 表示当前执行的观察者函数
    //  2.  清空newDeps newDepsId
    pushTarget(this)
    ///////////////////////////
    let value
    const vm = this.vm
    try {
    ///////////////////////////
    //  执行观察者函数，开始计算
    //  如果某个观察者函数访问了某个数据，我们就可以把这个观察者函数认为是依赖这个数据的：
    //  这一步执行了defineReactive，计算过程中，就会触发getter，表明这个观察者函数访问了某个数据
    //  这里的getter是一个函数或者经expression提取得到的函数，调用会触发数据的get方法
    //  getter会执行watcher的addDep()方法，将数据记为依赖，也就是把这个数据的dep存入newDepIds、newDeps中
    ///////////////////////////
      value = this.getter.call(vm, vm)

    } catch (e: any) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
    ///////////////////////////
    // 进行事后清理工作，首先释放Dep.target，
    // 然后拿newDeps和deps进行对比，接着进行以下的处理： 
    // - newDeps里不存在，deps里存在的数据，表示是过期的缓存数据。相应的，从数据对应的dep.subs移除掉当前watcher 
    // - 将newDeps赋给deps，表示缓存本轮的计算结果，这样子下轮计算如果再依赖同一个数据，就不需要再收集了
    ///////////////////////////
      popTarget()
      this.cleanupDeps()
    }
    // 返回watcher对应表达式的值
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep(dep: Dep) {
    const id = dep.id
    //  这里还有一个去重的操作
    //  一次计算可能有数据被重复访问，如 a * a，数据a被访问两次
    //  因此，我们希望同一依赖只被收集一次，使用id去重
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 查看这个依赖是否在depIds中有
      // 由于这一逻辑，不存在：”deps中不存在但newDeps存在“的情况
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 交换depIds和newDepIds，并清空newDepIds
    let tmp: any = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    // 交换deps和newDeps，并清空depIds
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 当数据发生修改时，dep通知watcher update
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          )
        } else {
          // 触发用户定义的回调函数（如watch和computed），或触发视图更新（模板）
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.vm && !this.vm._isBeingDestroyed) {
      remove(this.vm._scope.effects, this)
    }
    if (this.active) {
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
      if (this.onStop) {
        this.onStop()
      }
    }
  }
}
