import { useEffect, useRef, useState } from 'react'
import { getEformDefinition } from '../api/eforms'
import * as FormioNs from 'formiojs'
import AllComponents from 'formiojs/components'
import ComponentsRegistry from 'formiojs/components/Components'
import './formioBootstrapCompat.css'

const resolveFormio = () => {
  const candidates = [
    FormioNs?.Formio,
    FormioNs?.default?.Formio,
    FormioNs?.default,
    FormioNs,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate.createForm === 'function') {
      return candidate
    }
  }

  return null
}

const ensureComponentsRegistered = (formio) => {
  const registry = formio?.Components || ComponentsRegistry
  const hasTextfield = Boolean(registry?.components?.textfield)
  if (!hasTextfield && typeof registry?.setComponents === 'function') {
    registry.setComponents(AllComponents)
  }
}

const normalizeEformData = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value
}

export default function UploadCategoryEform({
  categoryCode,
  categoryLabel,
  disabled = false,
  onChange,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSchema, setHasSchema] = useState(false)
  const containerRef = useRef(null)
  const formInstanceRef = useRef(null)

  useEffect(() => {
    if (!categoryCode) {
      setHasSchema(false)
      setError('')
      onChange && onChange({}, false)
      return
    }

    let cancelled = false

    const destroyForm = async () => {
      const instance = formInstanceRef.current
      if (instance && typeof instance.destroy === 'function') {
        try {
          await instance.destroy(true)
        } catch {
          // no-op
        }
      }
      formInstanceRef.current = null
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }

    const loadAndRender = async () => {
      setLoading(true)
      setError('')
      try {
        await destroyForm()

        const definition = await getEformDefinition(categoryCode)
        if (cancelled) {
          return
        }
        const schema = definition?.schema
        if (!schema || typeof schema !== 'object') {
          setHasSchema(false)
          onChange && onChange({}, false)
          return
        }

        const formio = resolveFormio()
        ensureComponentsRegistered(formio)
        if (!formio || typeof formio.createForm !== 'function') {
          throw new Error('Form.io renderer is unavailable in this build')
        }

        if (!containerRef.current) {
          return
        }

        const instance = await formio.createForm(containerRef.current, schema, {
          readOnly: disabled,
          noAlerts: true,
          submitOnEnter: false,
        })
        if (cancelled) {
          if (typeof instance?.destroy === 'function') {
            await instance.destroy(true)
          }
          return
        }

        formInstanceRef.current = instance
        setHasSchema(true)

        const initialData = normalizeEformData(instance?.submission?.data)
        onChange && onChange(initialData, true)

        instance.on('change', (event) => {
          const nextData = normalizeEformData(event?.data || instance?.submission?.data)
          onChange && onChange(nextData, true)
        })
      } catch (err) {
        if (cancelled) {
          return
        }
        if (err?.status === 404) {
          setHasSchema(false)
          onChange && onChange({}, false)
        } else {
          setError(err.message || 'Failed to load category eForm')
          setHasSchema(false)
          onChange && onChange({}, false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadAndRender()

    return () => {
      cancelled = true
      destroyForm()
    }
  }, [categoryCode, disabled, onChange])

  if (!categoryCode) {
    return null
  }

  return (
    <section className="metadata-input-card">
      <div className="metadata-template-summary" style={{ marginBottom: 8 }}>
        <p className="metadata-template-summary__title">Category eForm</p>
        <p className="metadata-template-summary__empty">
          {categoryLabel || categoryCode}
        </p>
      </div>

      {loading && <p className="pill pill--info">Loading eForm…</p>}
      {!loading && !hasSchema && !error && (
        <p className="metadata-template-summary__empty">No eForm configured for this category.</p>
      )}
      {error && <p className="feedback feedback--error">{error}</p>}
      <div className="formio-compat" ref={containerRef} />
    </section>
  )
}
