import { useState } from 'react'

function FolderTreeNode({ node, level, selectedId, onSelect, onDropDocument, draggingDocumentId }) {
  const [expanded, setExpanded] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const hasChildren = Boolean(node.children?.length)
  const allowDrop = Boolean(draggingDocumentId)

  const handleDragOver = (event) => {
    if (!allowDrop) return
    event.preventDefault()
    if (!isDragOver) {
      setIsDragOver(true)
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDragLeave = () => {
    if (isDragOver) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (event) => {
    if (!allowDrop) return
    event.preventDefault()
    setIsDragOver(false)
    onDropDocument?.(node.id)
  }

  return (
    <li>
      <div
        className={`folder-tree__row ${isDragOver ? 'is-drop-target' : ''}`}
        style={{ paddingLeft: `${level * 1.25}rem` }}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {hasChildren ? (
          <button type="button" className="folder-tree__toggle" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="folder-tree__spacer" />
        )}
        <button
          type="button"
          className={`folder-tree__item ${selectedId === node.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(node.id)}
        >
          <span className="folder-tree__icon" aria-hidden>
            📁
          </span>
          <span className="folder-tree__name">{node.name}</span>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDropDocument={onDropDocument}
              draggingDocumentId={draggingDocumentId}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function FolderTree({ nodes = [], selectedId, onSelect, onDropDocument, draggingDocumentId }) {
  if (!nodes.length) {
    return null
  }
  return (
    <ul className="folder-tree">
      {nodes.map((node) => (
        <FolderTreeNode
          key={node.id}
          node={node}
          level={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onDropDocument={onDropDocument}
          draggingDocumentId={draggingDocumentId}
        />
      ))}
    </ul>
  )
}
