/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { TriggerOpTypes } from '../../v3'
import { def } from '../util/index'

const arrayProto = Array.prototype

// 新建一个空对象作为数组的拦截器
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 使用Object.defineProperty方法将那些可以改变数组自身的7个方法遍历逐个进行封装
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  // 当我们使用push方法的时候，其实用的是arrayMethods.push，而arrayMethods.push就是封装的新函数mutator，
  // 也就是说，实标上执行的是函数mutator，而mutator函数内部执行了original函数，
  // 这个original函数就是Array.prototype上对应的原生方法。
  def(arrayMethods, method, function mutator(...args) {
    const result = original.apply(this, args) //  先执行数组的原始方法
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 检测是否新增元素，新增需要为新增元素加入__ob__
    if (inserted) ob.observeArray(inserted)
    // notify change
    if (__DEV__) {
      ob.dep.notify({
        type: TriggerOpTypes.ARRAY_MUTATION,
        target: this,
        key: method
      })
    } else {
      // 数组方法调用后，同时该数组的dep更新
      ob.dep.notify()
    }
    return result
  })
})
