const request = require('supertest')
const _ = require('lodash')
const { expect, test, afterAll, beforeEach } = global
const Promise = require('bluebird')

class ResourceTester {
  constructor (server, resource) {
    this.server = server
    this.resource = resource
    this.middlewares = []
    this.teardowns = []
    afterAll(async () => {
      await Promise.promisify(this.server.close).call(this.server)
      await Promise.all(this.teardowns.map(td => td()))
    })
  }
  teardown (...down) {
    this.teardowns.push(...down)
    return this
  }
  setup (data, middleware = req => req) {
    const self = this
    let body = data
    if (!_.isFunction(data)) {
      body = () => data
    }
    beforeEach(function () {
      this.resource = self.req(middleware(request(self.server).post(self.resource)))
      let d = body()
      if (d) this.resource.send(d)

      return this.resource
    })

    return this
  }
  use (...middlewares) {
    if (middlewares) {
      this.middlewares = middlewares
    }
    return this
  }
  req (req) {
    this.middlewares.forEach(middleware => middleware(req))
    return req
  }
  options (options = {}) {
    let before, assert, data, patch, errorAssert
    if (_.isFunction(options)) {
      assert = options
    } else {
      before = options.before
      assert = options.assert
      errorAssert = options.errorAssert
      data = options.data
      patch = options.patch
    }
    before = before || (req => req)
    assert = assert || (res => res)
    errorAssert = errorAssert || (err => { throw err })

    return { before, assert, data, patch, errorAssert }
  }
  create (options) {
    const {before, assert, data, errorAssert} = this.options(options)
    const self = this
    const basic = res => {
      expect(res.status).toBe(201)
      return res
    }
    test(`POST ${this.resource}`, async function () {
      let res
      if (this.resource) {
        res = this.resource
      } else {
        res = self.req(before(request(self.server).post(self.resource)))
        if (data) res.send(data)
      }
      return await res.then(basic).then(assert).catch(errorAssert)
    })
    return this
  }
  update (options) {
    const {before, assert, data, patch, errorAssert} = this.options(options)
    const self = this
    const basic = res => {
      expect(res.status).toBe(202)
      _.forIn(patch, (v, k) => expect(res.body[k]).toBe(v))
      return res
    }
    test(`PATCH ${this.resource}/:id`, async function () {
      let res
      if (this.resource) {
        res = this.resource
      } else {
        res = self.req(before(request(self.server).post(self.resource)))
        if (data) res.send(data)
      }
      const origin = await res
      const ures = self.req(before(request(self.server).patch(`${self.resource}/${origin.body.id}`)))
      if (patch) ures.send(patch)
      return await ures.then(basic).then(assert).catch(errorAssert)
    })
    return this
  }
  read (options) {
    const {before, assert, data, errorAssert} = this.options(options)
    const self = this
    const basic = res => {
      expect(res.status).toBe(200)
      return res
    }
    test(`GET ${this.resource}`, async function () {
      await (this.resource || self.req(before(request(self.server).post(self.resource).send(data))))
      return await self.req(before(request(self.server).get(self.resource))).then(basic).then(res => {
        expect(res.body).toBeInstanceOf(Array)
        return res
      }).then(assert).catch(errorAssert)
    })
    test(`GET ${this.resource}/:id`, async function () {
      const res = this.resource || self.req(before(request(self.server).post(self.resource).send(data)))
      const origin = await res
      return await self.req(before(request(self.server).get(`${self.resource}/${origin.body.id}`))).then(basic).then(res => {
        expect(res.body.id).toBe(origin.body.id)
        return res
      }).then(assert).catch(errorAssert)
    })
    return this
  }
  destroy (options) {
    const {before, assert, data, errorAssert} = this.options(options)
    const self = this
    const basic = res => {
      expect(res.status).toBe(204)
      return res
    }
    test(`DELETE ${this.resource}/:id`, async function () {
      let res
      if (this.resource) {
        res = this.resource
      } else {
        res = self.req(before(request(self.server).post(self.resource)))
        if (data) res.send(data)
      }
      const origin = await res
      return await self.req(before(request(self.server).del(`${self.resource}/${origin.body.id}`))).then(basic).then(assert).catch(errorAssert)
    })
    return this
  }
  crud (options) {
    return this.create(options).read(options).update(options).destroy(options)
  }
}

function restful (server, resource) {
  return new ResourceTester(server, resource)
}

module.exports = {
  default: restful,
  restful,
  ResourceTester,
  request
}