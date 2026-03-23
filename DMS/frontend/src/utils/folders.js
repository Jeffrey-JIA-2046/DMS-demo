export const collectFolderIds = (nodes = []) => {
  const ids = []
  const walk = (list) => {
    list.forEach((node) => {
      ids.push(node.id)
      if (node.children?.length) {
        walk(node.children)
      }
    })
  }
  walk(nodes)
  return ids
}

export const findFolderPath = (nodes = [], targetId, trail = []) => {
  for (const node of nodes) {
    const nextTrail = [...trail, node.name]
    if (node.id === targetId) {
      return nextTrail
    }
    if (node.children?.length) {
      const result = findFolderPath(node.children, targetId, nextTrail)
      if (result) {
        return result
      }
    }
  }
  return null
}

export const findFolderNode = (nodes = [], targetId) => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }
    if (node.children?.length) {
      const result = findFolderNode(node.children, targetId)
      if (result) {
        return result
      }
    }
  }
  return null
}
