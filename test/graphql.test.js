const { server } = require('./lib/server')
const { graphql } = require('../lib/test')
const Promise = require('bluebird')
const { describe, afterAll, expect } = global

const graphqlRequest = {
  server,
  endpoint: '/graphql'
}

afterAll(async () => {
  await Promise.promisify(server.close).call(server)
})

describe('GraphQL', () => {
  graphql.query('posts', graphqlRequest, `
    query Query {
      posts {
        id
        title
        content
      }
    }
  `, ({data}, res) => {
    expect(data.posts).toBeInstanceOf(Array)
  })
  graphql.query('fetch', graphqlRequest, `
    query Query {
      fetch(id: 1, type: POST) {
        ... on Post {
          id
        }
      }
    }
  `, ({data, errors}, res) => {
    expect(errors).toBe(undefined)
    expect(data.fetch.id).toBe('1')
  })
  graphql.query('searchByType', graphqlRequest, `
    query Query {
      search(first: 1, type: POST) {
        total
        edges {
          node {
            id
            title
            comments {
              id
              title
            }
          }
          cursor
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  `, ({data}) => {
    expect(data.search.edges).toBeInstanceOf(Array)
    expect(data.search.pageInfo.hasNextPage).toBe(true)
    expect(data.search.edges[0].cursor).not.toBe(null)
    expect(data.search.edges[0].node).not.toBe(null)
  })
  graphql.query('searchByHelper', graphqlRequest, `
    query Query {
      searchByHelper(first: 1, type: POST) {
        total
        edges {
          node {
            ... on Post {
              id
              title
              comments {
                id
                title
              }
            }
          }
          cursor
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  `, ({data, errors}) => {
    expect(errors).toBe(undefined)
    expect(data).not.toBe(null)
    expect(data.searchByHelper.edges).toBeInstanceOf(Array)
    expect(data.searchByHelper.pageInfo.hasNextPage).toBe(true)
    expect(data.searchByHelper.edges[0].cursor).not.toBe(null)
    expect(data.searchByHelper.edges[0].node).not.toBe(null)
  })
  graphql.query('searchByOffset', graphqlRequest, `
    query Query {
      searchByOffset(first: 1) {
        total
        edges {
          node {
            id
            title
            comments {
              id
              title
            }
          }
          cursor
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  `, ({data}) => {
    expect(data.searchByOffset.edges).toBeInstanceOf(Array)
    expect(data.searchByOffset.pageInfo.hasNextPage).toBe(true)
    expect(data.searchByOffset.edges[0].cursor).not.toBe(null)
    expect(data.searchByOffset.edges[0].node).not.toBe(null)
  })
  graphql.query('searchByOffset None', graphqlRequest, `
    query Query {
      searchByOffset(keyword: "Notexists") {
        total
        edges {
          node {
            id
            title
            comments {
              id
              title
            }
          }
          cursor
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  `, ({data}) => {
    expect(data.searchByOffset.edges).toBeInstanceOf(Array)
    expect(data.searchByOffset.edges.length).toBe(0)
    expect(data.searchByOffset.total).toBe(0)
  })
  graphql.query('searchByCursor', graphqlRequest, `
    query Query {
      searchByCursor(first: 1) {
        total
        edges {
          node {
            id
            title
            comments {
              id
              title
            }
          }
          cursor
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  `, ({data, errors}) => {
    expect(errors).toBe(undefined)
    expect(data.searchByCursor.edges).toBeInstanceOf(Array)
    expect(data.searchByCursor.pageInfo.hasNextPage).toBe(true)
    expect(data.searchByCursor.edges[0].cursor).not.toBe(null)
    expect(data.searchByCursor.edges[0].node).not.toBe(null)
  })
  graphql.query('nested', graphqlRequest, `
    query Query {
      posts {
        id
        title
        content
        commentList: comments {
          id
          title
          content
        }
      }
    }
  `, ({data}) => {
    expect(data.posts).toBeInstanceOf(Array)
    expect(data.posts[0].commentList).toBeInstanceOf(Array)
  })
  graphql.query('post', graphqlRequest, `
    query Query {
      post(id: 1) {
        id
        title
        content
      }
    }
  `, ({data}) => {
    expect(data.post.id).toBe('1')
  })
  graphql.query('mutation test', graphqlRequest, `
    mutation {
      test(id: 110)
    }
  `, ({data}) => {
    expect(data.test).toBe(true)
  })
  graphql.create('Post', graphqlRequest, {
    name: 'Post',
    variables: {
      input: {
        test1: 'Hehe',
        title: 'post title',
        content: 'post content'
      }
    }
  })
  graphql.mutation('Comment', graphqlRequest, {
    name: 'Comment',
    inputType: 'JSON',
    variables: {
      input: {
        title: 'post title',
        content: 'post content'
      }
    },
    update: {
      input: {
        title: 'edited'
      }
    }
  })
  graphql.query('combine query', graphqlRequest, `
    query Query {
      posts {
        id
        title
        content
      }
      post(id: 1) {
        id
        title
        content
      }
    }
  `, ({data}) => {
    expect(data.posts).toBeInstanceOf(Array)
    expect(data.post.id).toBe('1')
  })
})
