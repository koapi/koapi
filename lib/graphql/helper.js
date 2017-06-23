const types = require('./types')
const { isEmpty, isArray } = require('lodash')
const relay = require('./relay')
const { wrap } = require('lodash')
// const { default: compose } = require('just-compose')
const pluralize = require('pluralize')

const defaultWrapper = (resolver, ...args) => {
  return resolver(...args)
}

const helper = module.exports = {
  resolve (...resolvers) {
    return async (...args) => {
      let value
      for (const resolver of resolvers) {
        value = await resolver(...args, value)
      }
      return value
    }
  },
  batchLoad (options = {}) {
    return async (root, args, ctx, info) => {
      const {
        getLoader = ctx => ctx.loader,
        parent = root.constructor,
        foreignKey = `${pluralize.singular(root.constructor.prototype.tableName)}_id`,
        mappingKey = pluralize.singular(root.constructor.prototype.tableName),
        list = true,
        model
      } = options
      const loader = getLoader(ctx)
      const data = await loader.acquire(`${parent.name}-${model.name}`, parents => {
        if (list) {
          return model.forge().query(q => q.whereIn(foreignKey, parents.map(parent => parent.id)))
            .fetchAll().then(items => parents.map(parent => items.filter(item => {
              if (item.get(foreignKey) === parent.id) {
                item[mappingKey] = item
                return true
              }
              return false
            })))
        } else {
          const parentKey = options.parentKey || `${pluralize.singular(model.prototype.tableName)}_id`
          return model.forge().query(q => q.whereIn('id', parents.map(parent => parent.get(parentKey))))
            .fetchAll().then(items => parents.map(parent =>
              items.find(item => item.id === parent.get(parentKey))
            ))
        }
      }).load(root)
      return data
    }
  },
  mutation (options) {
    const { type, enabled = ['create', 'update', 'destroy'], name } = options
    const mutation = {}
    for (const action of enabled) {
      mutation[`${action}${name || type}`] = helper[action](options)
    }

    return mutation
  },
  create ({
    model,
    type,
    collection,
    wrapper = defaultWrapper,
    args,
    options = {}
  }) {
    collection = collection || (ctx => model.collection())
    const resolver = (root, { attributes }, ctx) => {
      attributes = ctx.attributes || attributes
      return collection(ctx).create(attributes,
        Object.assign({method: 'insert'}, options, ctx.saveOptions)
      )
    }
    return {
      type,
      args: Object.assign({ attributes: types.json() }, args),
      resolve: wrap(resolver, wrapper)
    }
  },
  update ({
    model,
    type,
    collection,
    wrapper = defaultWrapper,
    args,
    idAttribute,
    options = {}
  }) {
    collection = collection || (ctx => model.collection())
    idAttribute = idAttribute || model.prototype.idAttribute
    const resolver = async (root, { id, attributes }, ctx) => {
      attributes = ctx.attributes || attributes
      const query = ctx.query || collection(ctx)
      const item = await query.query({
        where: { [idAttribute]: id }}).fetchOne({require: true})
      await item.save(
        attributes,
          Object.assign({ patch: true }, options, ctx.saveOptions))
      return item
    }
    return {
      type,
      args: Object.assign({attributes: types.json(), id: types.int()}, args),
      resolve: wrap(resolver, wrapper)
    }
  },
  destroy ({
    model,
    collection,
    wrapper = defaultWrapper,
    args,
    idAttribute,
    options = {}
  }) {
    collection = collection || (ctx => model.collection())
    idAttribute = idAttribute || model.prototype.idAttribute
    const resolver = async (root, { id }, ctx) => {
      const query = ctx.query || collection(ctx)
      const item = await query.query({
        where: { [idAttribute]: id }}).fetchOne({require: true})
      await item.destroy(Object.assign({}, options, ctx.destroyOptions))
      return true
    }
    return {
      type: types.Boolean,
      args: Object.assign({ id: types.int() }, args),
      resolve: wrap(resolver, wrapper)
    }
  },
  connection: {
    args (args) {
      return Object.assign({
        keyword: types.string(),
        orderBy: types.string(),
        filterBy: types.string()
      }, args)
    },
    resolve (options) {
      const {
        collection = ctx => options.model.collection(),
        searchable = [],
        sortable = [],
        filterable = [],
        limit = 10
      } = options || {}
      return async (model, {first = limit, after, keyword, orderBy, filterBy = {}}, ctx, info) => {
        const { query = collection(ctx, model) } = ctx
        const result = await query.query(q => {
          if (query.relatedData) {
            const foreignKey = query.relatedData.key('foreignKey')
            const parentId = query.relatedData.parentId
            q.where({ [foreignKey]: parentId })
          }
          if (!isEmpty(filterBy) && filterable.length) {
            const filter = field => {
              if (filterBy[field]) {
                q.where({[field]: filterBy[field]})
              }
            }
            const applyFilters = isArray(filterable)
            ? () => filterable.forEach(filter)
            : filterable
            applyFilters({ filter, query: q, filterBy })
          }
          if (searchable.length && keyword) {
            q.where(function () {
              const like = ['pg', 'postgres'].includes(q.client.config.client)
                ? 'ILIKE' : 'LIKE'
              searchable.forEach((field, index) => index
                ? this.orWhere(field, like, `%${keyword}%`)
                : this.where(field, like, `%${keyword}%`))
            })
          }
          if (sortable.length) {
            let orderByField = sortable[0]
            let orderByDirection = 'DESC'
            if (orderBy) {
              orderByField = orderBy.trimLeft('-')
              orderByDirection = orderBy[0] === '-' ? 'DESC' : 'ASC'
            }
            q.orderBy(orderByField, orderByDirection)
          }
        }).fetchPage({
          limit: first,
          offset: after
        })
        const hasNextPage = after < result.pagination.rowCount - first
        return {
          totalCount: result.pagination.rowCount,
          edges: result.models.map((node, index) => ({node, cursor: after + index})),
          pageInfo: {
            startCursor: after,
            endCursor: after + first,
            hasNextPage
          }
        }
      }
    }
  },
  search (items, options) {
    const name = options.name
    const cursor = options.cursor || {
      node: ({after, index}) => after + index,
      start: ({after}) => after,
      end: ({after, first}) => after + first,
      hasNext: ({result, after, first}) => after < result.meta.count - first
    }
    const itemsArray = Object.entries(items).map(([searchName, itemConfig]) => ({
      name: searchName,
      model: itemConfig.model,
      handler: itemConfig.handler || (async ({first, after}) => {
        const result = await itemConfig.model.forge().fetchPage({limit: first, offset: after})
        return {
          meta: {
            count: result.pagination.rowCount,
            offset: result.pagination.offset,
            limit: result.pagination.limit
          },
          nodes: result.models
        }
      }),
      type: itemConfig.type
    }))
    const searchValues = itemsArray.reduce((values, item) => {
      const handler = item.handler
      values[item.name] = { value: handler }
      return values
    }, {})
    const SearchType = new types.Enum({
      name: `${name}SearchType`,
      values: searchValues
    })
    const SearchableItem = new types.Union({
      name: `${name}SearchableItem`,
      types: itemsArray.map(item => item.type),
      resolveType: model => {
        for (const item of itemsArray) {
          if (model instanceof item.model) {
            return item.type
          }
        }
      }
    })

    return {
      type: relay.connection.create(SearchableItem),
      args: relay.connection.args({
        type: types.nonNull(SearchType)()
      }),
      resolve: relay.connection.resolve(async (root, args, ctx) => {
        const {type, first, after} = args
        const result = await type(args)
        return {
          totalCount: result.meta.count,
          edges: result.nodes.map((node, index) => ({
            node,
            cursor: cursor.node({
              result,
              node,
              after,
              index
            })
          })),
          pageInfo: {
            startCursor: cursor.start({
              result,
              after,
              first
            }),
            endCursor: cursor.end({
              result,
              after,
              first
            }),
            hasNextPage: cursor.hasNext({
              after,
              first,
              result
            })
          }
        }
      })
    }
  }
}