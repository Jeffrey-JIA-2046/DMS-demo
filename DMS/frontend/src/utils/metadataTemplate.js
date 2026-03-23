const FIELD_TYPE_OPTIONS = [
  { value: 'TEXT', label: 'Short text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
]

const VALID_TYPES = FIELD_TYPE_OPTIONS.map((option) => option.value)
export const MAX_METADATA_FIELDS = 25
export const METADATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/

export const createEmptyMetadataField = () => ({
  key: '',
  label: '',
  type: 'TEXT',
  required: false,
  hint: '',
})

const sanitizeField = (field = {}) => {
  const key = (field.key ?? '').trim()
  const label = (field.label ?? '').trim()
  const type = VALID_TYPES.includes(field.type) ? field.type : 'TEXT'
  const required = Boolean(field.required)
  const hint = (field.hint ?? '').trim()
  return {
    key,
    label,
    type,
    required,
    hint: hint || null,
  }
}

export const normalizeMetadataTemplate = (fields = []) => {
  if (!Array.isArray(fields)) {
    return []
  }
  return fields
    .map(sanitizeField)
    .filter((field) => field.key && field.label)
}

const hasPartialField = (fields = []) => {
  return fields.some((field) => {
    if (!field) return false
    const key = (field.key ?? '').trim()
    const label = (field.label ?? '').trim()
    const hint = (field.hint ?? '').trim()
    const hasType = Boolean(field.type)
    const required = Boolean(field.required)
    const hasAny = key || label || hint || hasType || required
    if (!hasAny) {
      return false
    }
    return !(key && label)
  })
}

export const validateMetadataTemplate = (fields = []) => {
  if (!Array.isArray(fields)) {
    return { valid: false, error: 'Metadata template must be an array', normalized: [] }
  }
  if (fields.length > MAX_METADATA_FIELDS) {
    return { valid: false, error: `Limited to ${MAX_METADATA_FIELDS} metadata fields per folder`, normalized: [] }
  }
  const normalized = normalizeMetadataTemplate(fields)
  if (hasPartialField(fields)) {
    return { valid: false, error: 'Each metadata field must include both a key and a label', normalized }
  }
  const seen = new Set()
  for (const field of normalized) {
    if (!METADATA_KEY_PATTERN.test(field.key)) {
      return {
        valid: false,
        error: `Key "${field.key}" must start with a letter and may include numbers, underscores, or hyphens`,
        normalized,
      }
    }
    const keyId = field.key.toLowerCase()
    if (seen.has(keyId)) {
      return { valid: false, error: `Metadata key "${field.key}" is duplicated`, normalized }
    }
    seen.add(keyId)
    if (!VALID_TYPES.includes(field.type)) {
      return { valid: false, error: `Unsupported metadata type "${field.type}"`, normalized }
    }
  }
  return { valid: true, error: '', normalized }
}

export const METADATA_FIELD_TYPE_OPTIONS = FIELD_TYPE_OPTIONS

const coerceValue = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

export const normalizeMetadataValues = (template = [], values = {}) => {
  if (!Array.isArray(template) || !values) {
    return {}
  }
  const normalized = {}
  template.forEach((field) => {
    if (!field?.key) return
    const raw = coerceValue(values[field.key])
    const trimmed = raw.trim()
    if (!trimmed) {
      return
    }
    normalized[field.key] = trimmed
  })
  return normalized
}

export const validateMetadataValues = (template = [], values = {}) => {
  const errors = {}
  if (!Array.isArray(template) || !values) {
    return { valid: true, errors }
  }
  template.forEach((field) => {
    if (!field?.key) return
    const raw = coerceValue(values[field.key])
    const trimmed = raw.trim()
    if (!trimmed) {
      if (field.required) {
        errors[field.key] = 'This field is required.'
      }
      return
    }
    if (field.type === 'TEXT' && trimmed.length > 1024) {
      errors[field.key] = 'Use 1024 characters or fewer.'
      return
    }
    if (field.type === 'NUMBER') {
      if (Number.isNaN(Number(trimmed))) {
        errors[field.key] = 'Enter a valid number.'
        return
      }
    }
    if (field.type === 'DATE') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        errors[field.key] = 'Use YYYY-MM-DD format.'
        return
      }
    }
  })
  return { valid: Object.keys(errors).length === 0, errors }
}

export const describeMetadataField = (field) => {
  if (!field) return ''
  const option = FIELD_TYPE_OPTIONS.find((opt) => opt.value === field.type)
  const label = option?.label ?? 'Field'
  const requiredSuffix = field.required ? ' · Required' : ''
  return `${label}${requiredSuffix}`
}
