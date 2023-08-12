var addExample = createModuleExample('vue3')

var testData = {}
function consoleTestData() {
  Object.keys(testData).forEach(key => {
    let time = testData[key].reduce((a, b) => a + b, 0) / testData[key].length
    console.log(key + ',耗时:' + time + '豪秒')
  })
}
function startEndTime() {
  let time = Date.now()
  return function () {
    return Date.now() - time
  }
}
function testFnExecuTime(name, fn) {
  let data = (testData[name] = [])
  return function () {
    let end = startEndTime()
    fn.apply(this, arguments)
    let time = end()
    //  console.log(name + ',耗时:' + time + '豪秒')
    data.push(time)
    return time
  }
}
let EventEmitter = function (context) {
  this.context = context || this
  var events = []
  var currentEvents = []
  Object.defineProperty(this, 'events', {
    get() {
      return events
    },
    set() {
      throw '不能修改这个属性'
    }
  })
  this.emit = function (...args) {
    let fns = (currentEvents = events)
    for (let i = 0, len = fns.length; i < len; i++) {
      if (fns[i].callback.apply(this.context, args) === false) {
        break
      }
    }
    return this
  }
  this.remove = function (callback) {
    if (events === currentEvents) {
      events = currentEvents.slice()
    }
    let index = events.findIndex(d => d.callback == callback)
    if (index !== -1) {
      events.splice(index, 1)
    }
    return this
  }
  this.add = function (callback, priority = 0) {
    if (events === currentEvents) {
      events = currentEvents.slice()
    }
    let index = events.length
    for (let i = 0; i < events.length; i++) {
      if (priority > events[i].priority) {
        index = i
        break
      }
    }
    events.splice(index, 0, { callback: callback, priority: priority })
    return this
  }
}

function createCanvasRenderer(opts = {}) {
  let { devicePixelRatio, renderType, width, height, container } = {
    devicePixelRatio: 1,
    renderType: 'canvas',
    width: 500,
    height: 500,
    ...opts
  }
  let el = document.createElement('canvas')
  let viewWidth = (el.width = width * devicePixelRatio)
  let viewHeight = (el.height = height * devicePixelRatio)
  if (devicePixelRatio > 1) {
    el.style.width = width + 'px'
    el.style.height = height + 'px'
  }
  let ctx = el.getContext(renderType === 'canvas' ? '2d' : 'webgl')
  container.appendChild(el)

  let lastTime = 0,
    delta,
    current
  let instance = {
    ctx: ctx,
    width: viewWidth,
    height: viewHeight,
    init() {},
    clear() {
      ctx.clearRect(0, 0, viewWidth, viewHeight)
    },
    save() {
      ctx.save()
    },
    restore() {
      ctx.restore()
    },
    beginPath() {
      ctx.beginPath()
    },
    arc(x, y, radius, start, end, counterclockwise) {
      ctx.arc(x, y, radius, start, end, counterclockwise)
    },
    fill() {
      ctx.fill()
    },
    startDraw() {
      this.clear()
      this.save()
    },
    draw() {},
    afterDraw() {
      this.restore()
    }
  }
  let webglInstance = {
    ctx: ctx,
    width: viewWidth,
    height: viewHeight,
    regl: null,
    init() {
      this.regl = createREGL({
        canvas: el
      })
      this._drawCircle = this.regl({
        vert: `
                    precision mediump float;
                    attribute vec2 position;
                    attribute vec3 color;
                    mat2 mat3 modelMatrix;
                    varying vec3 fragColor;
                    void main(){
                        gl_Position=modelMatrix*vec4(position,0,1.0);
                        fragColor=color;
                    }
                `,
        frag: `
                    varying vec3 fragColor;
                    void main(){
                        gl_FragColor=vec4(fragColor,1.0);
                    }
                `,
        attributes: {
          position: regl.prop('position'),
          posicolortion: regl.prop('color')
        },
        uniforms: {
          modelMatrix: regl.prop('modelMatrix')
        }
      })
    },
    points: [],
    fillStyle: null,
    beginPath() {
      this.points.length = 0
    },
    drawCircle(x, y, r) {
      this._drawCircle({})
    },
    startDraw() {},
    draw() {},
    afterDraw() {}
  }
  let _instance = renderType === 'canvas' ? instance : webglInstance
  _instance.init()
  let hooks = {
    startDraw: new EventEmitter(_instance).add(_instance.startDraw),
    draw: new EventEmitter(_instance).add(_instance.draw),
    afterDraw: new EventEmitter(_instance).add(_instance.afterDraw)
  }
  let rendererAnimation = function (fn) {
    let lastTime = 0,
      delta
    let animate = function (current) {
      if (!lastTime) {
        lastTime = current
        window.requestAnimationFrame(animate)
        return
      }
      delta = current - lastTime
      lastTime = current
      rendererAnimation.draw(delta)
      rendererAnimation.currentAnimateId = window.requestAnimationFrame(animate)
    }
    hooks.draw.add(fn)
    window.requestAnimationFrame(animate)
    return function () {
      hooks.draw.remove(fn)
    }
  }
  rendererAnimation.draw = function (delta) {
    hooks.startDraw.emit(delta)
    hooks.draw.emit(delta)
    hooks.afterDraw.emit(delta)
  }
  rendererAnimation.currentAnimateId = null
  rendererAnimation.hooks = hooks
  rendererAnimation.stop = function () {
    if (rendererAnimation.currentAnimateId) {
      cancelAnimationFrame(rendererAnimation.currentAnimateId)
      rendererAnimation.currentAnimateId = null
    }
  }
  return rendererAnimation
}
function createCanvasTexture(color, radius) {
  var temp = document.createElement('canvas')
  var size = radius * 2
  temp.width = size
  temp.height = size
  var tctx = temp.getContext('2d')
  tctx.beginPath()
  tctx.fillStyle = color
  tctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
  tctx.fill()
  return temp
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min) + min)
}
function buildRandomPoints(count, bounds) {
  let minX = bounds[0],
    minY = bounds[1],
    maxX = bounds[2],
    maxY = bounds[3]
  let points = new Array(count)
  let colors = ['#ff0000', '#00ff00', '#0000ff']
  let colorsHex = [0xff0000, 0x00ff00, 0x0000ff]
  for (let i = 0; i < count; i++) {
    let x = randomInt(minX, maxX)
    let y = randomInt(minY, maxY)
    let colorIndex = randomInt(0, 3)
    points[i] = {
      x,
      y,
      r: randomInt(3, 6),
      color: colors[colorIndex],
      color2: colorsHex[colorIndex]
    }
  }
  return points
}
function buildUniformPoints(count, bounds, raduis = 5, padding = 2) {
  let minX = bounds[0],
    minY = bounds[1],
    maxX = bounds[2],
    maxY = bounds[3]
  let width = maxX - minX,
    height = maxY - minY
  let diameter = raduis * 2
  let colCount = Math.floor(width / diameter)
  let rowCount = Math.floor(height / diameter)
  let points = new Array(count)
  let colors = ['red', 'green', 'blue']
  let colorsHex = [0xff0000, 0x00ff00, 0x0000ff]

  let x = 0,
    y = 0
  for (let i = 0; i < count; i++) {
    let c = i % colCount
    let r = Math.floor((i * diameter) / width)
    let colorIndex = randomInt(0, 3)
    points[i] = {
      id: i,
      x: c * diameter + raduis,
      y: r * diameter + raduis,
      r: raduis,
      color: colors[colorIndex],
      color2: colorsHex[colorIndex]
    }
  }
  return points
}
var viewWidth = 1500,
  viewHeight = 1500
let testPoints = buildUniformPoints(200000, [0, 0, viewWidth, viewHeight])
let PI2 = Math.PI * 2

addExample('性能测试-canvas', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()

      onMounted(() => {
        let render = createCanvasRenderer({
          container: container.value,
          renderType: 'canvas',
          width: viewWidth,
          height: viewHeight
        })
        render.hooks.draw.add(
          testFnExecuTime('性能测试-每个图创建一个路径', function () {
            let ctx = this.ctx
            testPoints.forEach(point => {
              ctx.beginPath()
              ctx.fillStyle = point.color
              ctx.arc(point.x, point.y, point.r, 0, PI2)
              ctx.fill()
            })
          })
        )
        //render.draw()

        addGuiScheme(gui, {
          source: {
            refresh() {
              render.draw()
            },
            test100() {
              let count = 100
              while (count-- > 0) {
                render.draw()
              }
            }
          }
        })
      })
      return {
        main: container
      }
    }
  }
})
addExample('性能测试-canvas-one-beginpath', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()
      onMounted(() => {
        let render = createCanvasRenderer({
          container: container.value,
          renderType: 'canvas',
          width: viewWidth,
          height: viewHeight
        })
        let colorGroup = _.groupBy(testPoints, d => d.color)

        // 相同颜色在一个路径下
        render.hooks.draw.add(
          testFnExecuTime('性能测试-颜色分组只创建一个路径', function () {
            let ctx = this.ctx
            Object.keys(colorGroup).forEach((color, index) => {
              let points = colorGroup[color]
              ctx.beginPath()
              ctx.fillStyle = color
              points.forEach(point => {
                ctx.moveTo(point.x, point.y)
                ctx.arc(point.x, point.y, point.r, 0, PI2)
              })
              ctx.fill()
            })
          })
        )
        //render.draw()
        addGuiScheme(gui, {
          source: {
            refresh() {
              render.draw()
            },
            test100() {
              let count = 100
              while (count-- > 0) {
                render.draw()
              }
            }
          }
        })
      })
      return {
        main: container
      }
    }
  }
})

addExample('性能测试-canvas-createPattern', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()
      onMounted(() => {
        let render = createCanvasRenderer({
          container: container.value,
          renderType: 'canvas',
          width: viewWidth,
          height: viewHeight
        })

        function createCirce(color, r) {
          var p = document.createElement('canvas')
          p.width = r * 2
          p.height = r * 2
          var pctx = p.getContext('2d')
          pctx.fillStyle = color
          pctx.arc(r, r, r, 0, PI2, false)
          pctx.fill()
          // no-repeat repeat repeat-x repeat-y
          // 以左上角为坐标起始点
          var pattern = pctx.createPattern(p, 'no-repeat')
          return pattern
        }
        let colorCircle = {},
          len = testPoints.length
        let p = new Promise(resolve => {
          let next = () => {
            len--
            if (len <= 0) {
              resolve()
            }
          }
          testPoints.forEach(point => {
            if (!colorCircle[point.color]) {
              colorCircle[point.color] = createCirce(point.color, point.r)
              next()
              return
            }
            next()
          })
        })
        render.hooks.draw.add(
          testFnExecuTime('性能测试-createPattern', function () {
            let ctx = this.ctx
            // ctx.translate(100,100)
            // ctx.rect(0,0,100,100)
            // ctx.fillStyle=colorCircle['red']
            // ctx.fill()
            // ctx.stroke()
            testPoints.forEach(point => {
              ctx.beginPath()
              ctx.setTransform(1, 0, 0, 1, point.x, point.y)
              ctx.fillStyle = colorCircle[point.color]
              //ctx.moveTo(point.x,point.y)
              ctx.rect(0, 0, point.r * 2, point.r * 2)
              ctx.fill()
            })

            ctx.stroke()
          })
        )
        p.then(() => {
          // render.draw()
          addGuiScheme(gui, {
            source: {
              refresh() {
                render.draw()
              },
              test100() {
                let count = 100
                while (count-- > 0) {
                  render.draw()
                }
              }
            }
          })
        })
      })
      return {
        main: container
      }
    }
  }
})
addExample('性能测试-canvas-drawImage', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()
      onMounted(() => {
        let render = createCanvasRenderer({
          container: container.value,
          renderType: 'canvas',
          width: viewWidth,
          height: viewHeight
        })
        function createCirce(color, r) {
          var p = document.createElement('canvas')
          p.width = r * 2
          p.height = r * 2
          var pctx = p.getContext('2d')
          pctx.fillStyle = color
          pctx.arc(r, r, r, 0, PI2, false)
          pctx.fill()

          return new Promise(resolve => {
            let img = new Image()
            img.onload = () => {
              resolve(img)
            }
            img.src = p.toDataURL('image/png')
          })
        }
        let colorCircle = {},
          len = testPoints.length
        let p = new Promise(resolve => {
          let next = () => {
            len--
            if (len <= 0) {
              resolve()
            }
          }
          testPoints.forEach(point => {
            if (!colorCircle[point.color]) {
              colorCircle[point.color] = true
              createCirce(point.color, point.r).then(
                img => {
                  colorCircle[point.color] = img
                  next()
                },
                () => {
                  next()
                }
              )
              return
            }
            next()
          })
        })
        render.hooks.draw.add(
          testFnExecuTime('性能测试-drawImage', function () {
            let ctx = this.ctx
            testPoints.forEach(point => {
              // ctx.beginPath()
              // ctx.fillStyle=point.color;
              ctx.drawImage(colorCircle[point.color], point.x, point.y)

              //ctx.fill()
            })
          })
        )
        p.then(() => {
          addGuiScheme(gui, {
            source: {
              refresh() {
                render.draw()
              },
              test100() {
                let count = 100
                while (count-- > 0) {
                  render.draw()
                }
              }
            }
          })
        })
      })
      return {
        main: container
      }
    }
  }
})
addExample('性能测试-threejs', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()
      onMounted(() => {
        let renderer = new THREE.WebGLRenderer({})

        let scene = new THREE.Scene()
        let camera = new THREE.OrthographicCamera(
          0,
          viewWidth,
          0,
          viewHeight,
          1,
          1000
        )
        camera.position.set(0, 2, 100)
        camera.lookAt(0, 0, 0)
        renderer.clearColor(0xddd)
        renderer.setSize(viewWidth, viewHeight)
        container.value.appendChild(renderer.domElement)
        let colorGroup = _.groupBy(testPoints, d => d.color)
        let cacheGem = {}

        var draw = testFnExecuTime('性能测试-three', function () {
          scene.clear()
          Object.keys(colorGroup).forEach((color, index) => {
            let testpoints = colorGroup[color]

            const path = new THREE.Path()
            var vertices = []
            testpoints.forEach(point => {
              vertices.push(point.x, point.y, 1)
              // path.arc(point.x,point.y,point.r,0,PI2)
            })
            vertices = new THREE.Float32BufferAttribute(vertices, 3)
            const points = path.getPoints()
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', vertices)
            // geometry.setFromPoints(points);

            var sprite = new THREE.CanvasTexture(
              createCanvasTexture(color, testpoints[0].r)
            )
            const material = new THREE.PointsMaterial({
              color: testpoints[0].color2,
              map: sprite,
              size: testpoints[0].r * 2,
              sizeAttenuation: false,
              alphaTest: 0.5,
              transparent: true
            })

            var mesh = new THREE.Points(geometry, material)
            mesh.name = 'mesh'

            scene.add(mesh)
          })
          renderer.render(scene, camera)
        })

        addGuiScheme(gui, {
          source: {
            refresh() {
              draw()
            },
            test100() {
              let count = 100
              while (count-- > 0) {
                draw()
              }
            }
          }
        })
      })
      return {
        main: container
      }
    }
  }
})

addExample('性能测试-pixijs', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()
      onMounted(() => {
        let app = new PIXI.Application({
          width: viewWidth,
          height: viewHeight,
          autoStart: false
        })

        container.value.appendChild(app.view)
        let colorGroup = _.groupBy(testPoints, d => d.color)

        let g = new PIXI.Graphics()
        testPoints.forEach(point => {
          g.beginFill(point.color2)
          g.drawCircle(point.x, point.y, point.r)
          g.endFill()
        })
        app.stage.addChild(g)

        var draw = testFnExecuTime('性能测试-pixijs', function () {
          app.render()
        })

        addGuiScheme(gui, {
          source: {
            refresh() {
              draw()
            },
            test100() {
              let count = 100
              while (count-- > 0) {
                draw()
              }
            }
          }
        })
      })
      return {
        main: container
      }
    }
  }
})
addExample('性能测试-zrender', function ({ gui }) {
  let {
    toRaw,
    ref,
    unref,
    provide,
    inject,
    getCurrentInstance,
    reactive,
    shallowReactive,
    computed,
    watchEffect,
    watch,
    onBeforeMount,
    onMounted,
    onBeforeUpdated,
    onUpdated,
    onBeforeUnmount,
    onUnmounted,
    toRef,
    toRefs
  } = Vue
  return {
    template: `<div><div ref="main"></div></div>`,
    setup(props, ctx) {
      let container = ref()
      onMounted(() => {
        let render = (window.render = zrender.init(container.value, {
          width: viewWidth,
          height: viewHeight,
          devicePixelRatio: 1,
          useDirtyRect: false
        }))
        let g = new zrender.Group()
        render.add(g)
        let colorGroup = _.groupBy(testPoints, d => d.color)

        var first = false
        var draw = testFnExecuTime('性能测试-zrender', function () {
          if (first) {
            g.eachChild(point => {
              point.setStyle({
                fill: '#' + Math.random().toString(16).substr(2, 6)
              })
            })
            render.refresh()
            return
          }
          first = true
          testPoints.forEach(point => {
            let circle = new zrender.Circle({
              shape: {
                cx: point.x,
                cy: point.y,
                r: point.r
              },
              style: {
                fill: point.color
              }
            })
            g.add(circle)
          })
        })

        addGuiScheme(gui, {
          source: {
            refresh() {
              draw()
            },
            test100() {
              let count = 100
              while (count-- > 0) {
                draw()
              }
            }
          }
        })
      })
      return {
        main: container
      }
    }
  }
})
