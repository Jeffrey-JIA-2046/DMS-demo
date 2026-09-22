import { FileViewer } from '@file-viewer/react-full'

export default function FileViewerPreview({ data, fileName, className = '' }) {
  if (!data?.byteLength) {
    return null
  }

  return (
    <div className={`file-viewer-preview ${className}`.trim()} style={{ minHeight: 420 }}>
      <FileViewer
        key={`${fileName}-${data.byteLength}`}
        buffer={data}
        filename={fileName || 'document'}
        options={{
          theme: 'light',
          toolbar: { position: 'top' },
        }}
      />
    </div>
  )
}
