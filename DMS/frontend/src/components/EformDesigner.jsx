import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchActiveCodeTableItems } from '../api/codeTable'
import {
  deleteEformDefinition,
  getEformDefinitionAdmin,
  upsertEformDefinition,
} from '../api/eforms'
import * as FormioNs from 'formiojs'
import AllComponents from 'formiojs/components'
import ComponentsRegistry from 'formiojs/components/Components'
import 'formiojs/dist/formio.full.min.css'
import './formioBootstrapCompat.css'

const EMPTY_SCHEMA = {
  display: 'form',
  components: [],
}

const resolveFormio = () => {
  const candidates = [
    FormioNs?.Formio,
    FormioNs?.default?.Formio,
    FormioNs?.default,
    FormioNs,
  ]

  for (const candidate of candidates) {
    if (candidate && (typeof candidate.builder === 'function' || typeof candidate.createForm === 'function')) {
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

const normalizeSchema = (schema) => {
  if (!schema || typeof schema !== 'object') {
    return EMPTY_SCHEMA
  }
  if (!Array.isArray(schema.components)) {
    return { ...schema, components: [] }
  }
  return schema
}

export default function EformDesigner() {
  const [categories, setCategories] = useState([])
  const [selectedCategoryCode, setSelectedCategoryCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [hasSavedSchema, setHasSavedSchema] = useState(false)
  const [schema, setSchema] = useState(EMPTY_SCHEMA)

  const builderContainerRef = useRef(null)
  const builderInstanceRef = useRef(null)

  const selectedCategory = useMemo(
    () => categories.find((item) => item?.itemCode === selectedCategoryCode) || null,
    [categories, selectedCategoryCode]
  )

  useEffect(() => {
    let cancelled = false
    const loadCategories = async () => {
      try {
        const items = await fetchActiveCodeTableItems('DOCUMENT_CATEGORY')
        if (cancelled) {
          return
        }
        const normalized = Array.isArray(items) ? items : []
        setCategories(normalized)
        if (!selectedCategoryCode && normalized.length > 0) {
          setSelectedCategoryCode(normalized[0].itemCode)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load document categories')
        }
      }
    }
    loadCategories()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedCategoryCode) {
      setSchema(EMPTY_SCHEMA)
      setHasSavedSchema(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setInfo('')

    const loadDefinition = async () => {
      try {
        const definition = await getEformDefinitionAdmin(selectedCategoryCode)
        if (cancelled) {
          return
        }
        setSchema(normalizeSchema(definition?.schema))
        setHasSavedSchema(true)
      } catch (err) {
        if (cancelled) {
          return
        }
        if (err?.status === 404) {
          setSchema(EMPTY_SCHEMA)
          setHasSavedSchema(false)
          return
        }
        setError(err.message || 'Failed to load eForm schema')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDefinition()
    return () => {
      cancelled = true
    }
  }, [selectedCategoryCode])

  useEffect(() => {
    let cancelled = false

    const destroyBuilder = async () => {
      const instance = builderInstanceRef.current
      if (instance && typeof instance.destroy === 'function') {
        try {
          await instance.destroy(true)
        } catch {
          // no-op
        }
      }
      builderInstanceRef.current = null
    }

    const initializeBuilder = async () => {
      if (!builderContainerRef.current) {
        return
      }

      await destroyBuilder()
      builderContainerRef.current.innerHTML = ''

      try {
        const formio = resolveFormio()
        ensureComponentsRegistered(formio)
        const builder = formio && typeof formio.builder === 'function'
          ? formio.builder.bind(formio)
          : null
        if (typeof builder !== 'function') {
          throw new Error('Form.io builder is unavailable in this build')
        }

        const instance = await builder(builderContainerRef.current, normalizeSchema(schema), {
          noDefaultSubmitButton: true,
        })

        if (cancelled) {
          if (typeof instance?.destroy === 'function') {
            await instance.destroy(true)
          }
          return
        }

        builderInstanceRef.current = instance
        instance.on('change', (next) => {
          if (next && typeof next === 'object') {
            setSchema(normalizeSchema(next))
          }
        })
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to initialize Form.io builder')
        }
      }
    }

    if (!loading) {
      initializeBuilder()
    }

    return () => {
      cancelled = true
      destroyBuilder()
    }
  }, [selectedCategoryCode, loading])

  const handleSave = async () => {
    if (!selectedCategoryCode) {
      setError('Select a category first')
      return
    }

    setSaving(true)
    setError('')
    setInfo('')
    try {
      await upsertEformDefinition(selectedCategoryCode, {
        categoryCode: selectedCategoryCode,
        categoryLabel: selectedCategory?.itemLabel || selectedCategoryCode,
        schema: normalizeSchema(schema),
      })
      setHasSavedSchema(true)
      setInfo('eForm schema saved')
    } catch (err) {
      setError(err.message || 'Failed to save eForm schema')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedCategoryCode) {
      return
    }
    const confirmed = window.confirm(`Delete eForm schema for ${selectedCategoryCode}?`)
    if (!confirmed) {
      return
    }

    setSaving(true)
    setError('')
    setInfo('')
    try {
      await deleteEformDefinition(selectedCategoryCode)
      setHasSavedSchema(false)
      setSchema(EMPTY_SCHEMA)
      setInfo('eForm schema deleted')
    } catch (err) {
      setError(err.message || 'Failed to delete eForm schema')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card retention">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System administration</p>
          <h3>eForm Designer</h3>
          <p className="details-description">
            Build a Form.io eForm per document category. During upload, users in that category will fill this form and values are saved as document metadata.
          </p>
        </div>
      </div>

      {error && <p className="feedback feedback--error">{error}</p>}
      {info && <p className="feedback">{info}</p>}

      <div className="retention__form" style={{ alignItems: 'flex-end' }}>
        <label style={{ minWidth: 280 }}>
          <span>Document category</span>
          <select
            value={selectedCategoryCode}
            onChange={(e) => setSelectedCategoryCode(e.target.value)}
            disabled={saving || loading || categories.length === 0}
          >
            {categories.map((item) => (
              <option key={item.itemCode} value={item.itemCode}>
                {item.itemLabel} ({item.itemCode})
              </option>
            ))}
          </select>
        </label>

        <span className={`pill ${hasSavedSchema ? 'pill--info' : 'pill--warning'}`}>
          {hasSavedSchema ? 'Schema configured' : 'No schema configured'}
        </span>

        <button type="button" className="primary" onClick={handleSave} disabled={saving || loading || !selectedCategoryCode}>
          {saving ? 'Saving…' : 'Save schema'}
        </button>
        <button type="button" className="ghost ghost--danger" onClick={handleDelete} disabled={saving || !hasSavedSchema || !selectedCategoryCode}>
          Delete schema
        </button>
      </div>

      {loading ? (
        <p className="empty-state">Loading schema…</p>
      ) : (
        <div className="retention__rules formio-compat" style={{ padding: 12 }}>
          <div ref={builderContainerRef} />
        </div>
      )}
    </section>
  )
}
