const _original = Meteor.user

const _getCache = function () {
  let result = undefined
  const instance =
    DDP._CurrentMethodInvocation.get() ||
    DDP._CurrentPublicationInvocation.get()

  if (!instance.userId) {
    return result
  }

  const connectionId = instance.connection.id
  const connectionData = Meteor.default_server.sessions.get(connectionId)
  // https://github.com/msavin/userCache/issues/5#issuecomment-498835713
  if (!connectionData) {
    return result
  }
  const collectionViews = connectionData.collectionViews
    .get('users')
    .documents.get(instance.userId)
  const data = (collectionViews && collectionViews.dataByKey) || []
  const source = Array.from(data.entries())

  source.forEach(function (item) {
    if (!result) {
      // ensure the _id field is included https://github.com/msavin/userCache/issues/9
      result = { _id: instance.userId }
    }
    const key = item[0]
    result[key] = item[1][0].value
  })

  return result
}

const _getField = function (doc, field) {
  field = field.split('.')

  for (let i = 0; i < field.length; i++) {
    if (Array.isArray(doc)) {
      // https://github.com/msavin/userCache/issues/8
      if (!doc.length) {
        return
      }
      if (field[i] === '[]') {
        // Skip to next field, only required if requested field is eg "emails.[].address"
        continue
      }
      doc = doc[0]
    }
    if (!doc[field[i]]) {
      return
    }
    doc = doc[field[i]]
  }

  return !!doc
}

Meteor.user = function (input) {
  if (typeof input === 'undefined' || Tracker?.active) {
    return _original()
  }

  if (input === true) {
    return _getCache()
  }

  if (typeof input === 'string') {
    input = [input]
  }

  if (typeof input === 'object') {
    const cache = _getCache()
    // some instances of _getCache() returning null inside a reactive publish (when logging out?)
    // https://github.com/msavin/userCache/issues/5#issuecomment-498835713
    let innocent = !!cache
    const fields = {} // for storing list of required fields for later

    input.forEach(function (item) {
      fields[item] = 1
      if (innocent && typeof _getField(cache, item) === 'undefined') {
        innocent = false
      }
    })

    // console.log({innocent, input});
    if (innocent) {
      return cache
    } else {
      // fetch only the required fields to reduce data transfer
      // https://github.com/msavin/userCache/issues/7
      const userId = Meteor.userId()
      return userId ? Meteor.users.findOne(userId, { fields }) : null
    }
  }
}
