import { useState, useEffect, useRef, useCallback } from 'react';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Accordion from 'react-bootstrap/Accordion';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Spinner from 'react-bootstrap/Spinner';
import { useApi, postApi } from '../hooks/useApi';
import type { CAPIConfig, ConnectionResource } from '../App';

interface TableResult {
  full_name: string;
  catalog_name: string;
  schema_name: string;
  name: string;
  table_type: string | null;
}

interface Props {
  config: CAPIConfig;
  catalogOverride?: string | null;
  onBack: () => void;
  onDone: () => void;
  onResourceCreated?: (resource: ConnectionResource) => void;
}

interface MappingField {
  id: string;
  capiParam: string;
  sourceColumn: string;
  transforms: string[];
  group: 'server' | 'user_data' | 'custom_data';
}

interface DefaultMapping {
  mapping: Record<string, unknown>;
}

const DEFAULT_CONVERSION_SOURCE_TABLE = '{marketplace_catalog}.meta_capi.conversion_data';
const LISTING_ID = '8a8f4ead-db28-45e9-b39b-aabbbe1dbe08';

const ALL_TRANSFORMS = [
  { value: 'sha256', label: 'SHA256 HASH' },
  { value: 'normalize', label: 'NORMALIZE' },
  { value: 'to_epoch', label: 'TO EPOCH TIMESTAMP' },
  { value: 'cast_float', label: 'CAST AS FLOAT' },
  { value: 'cast_int', label: 'CAST AS INTEGER' },
  { value: 'cast_string', label: 'CAST AS STRING' },
];

// Per Meta CAPI spec: which transforms are available and which are mandatory per parameter
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
const PARAM_TRANSFORM_RULES: Record<string, { available: string[]; mandatory: string[] }> = {
  // Server event params
  event_name:  { available: ['cast_string'], mandatory: [] },
  event_time:  { available: ['to_epoch'], mandatory: ['to_epoch'] },
  event_id:    { available: ['cast_string'], mandatory: [] },
  action_source: { available: ['cast_string'], mandatory: [] },
  event_source_url: { available: ['cast_string'], mandatory: [] },
  opt_out: { available: ['cast_string'], mandatory: [] },
  data_processing_options: { available: [], mandatory: [] },
  data_processing_options_country: { available: ['cast_int'], mandatory: [] },
  data_processing_options_state: { available: ['cast_int'], mandatory: [] },
  advanced_measurement_table: { available: [], mandatory: [] },

  // User data — fields that MUST be hashed per Meta spec
  em:  { available: ['normalize', 'sha256'], mandatory: ['normalize', 'sha256'] },
  ph:  { available: ['normalize', 'sha256'], mandatory: ['normalize', 'sha256'] },
  fn:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  ln:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  ge:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  db:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  ct:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  st:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  zp:  { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  country: { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  external_id: { available: ['sha256', 'cast_string'], mandatory: ['sha256'] },
  // User data — fields that should NOT be hashed
  client_ip_address: { available: ['cast_string'], mandatory: [] },
  client_user_agent: { available: ['cast_string'], mandatory: [] },
  fbc: { available: ['cast_string'], mandatory: [] },
  fbp: { available: ['cast_string'], mandatory: [] },
  subscription_id: { available: ['cast_string'], mandatory: [] },
  lead_id: { available: ['cast_string'], mandatory: [] },
  fb_login_id: { available: ['cast_string'], mandatory: [] },
  anon_id: { available: ['cast_string'], mandatory: [] },
  madid: { available: ['cast_string'], mandatory: [] },
  ctwa_clid: { available: ['cast_string'], mandatory: [] },
  page_id: { available: ['cast_string'], mandatory: [] },

  // Custom data
  value: { available: ['cast_float', 'cast_int', 'cast_string'], mandatory: ['cast_float'] },
  currency: { available: ['cast_string'], mandatory: [] },
  content_ids: { available: ['cast_string'], mandatory: [] },
  content_type: { available: ['cast_string'], mandatory: [] },
  content_name: { available: ['cast_string'], mandatory: [] },
  content_category: { available: ['cast_string'], mandatory: [] },
  contents: { available: [], mandatory: [] },
  num_items: { available: ['cast_int'], mandatory: ['cast_int'] },
  order_id: { available: ['cast_string'], mandatory: [] },
  predicted_ltv: { available: ['cast_float'], mandatory: [] },
  search_string: { available: ['cast_string'], mandatory: [] },
  status: { available: ['cast_string'], mandatory: [] },
  delivery_category: { available: ['cast_string'], mandatory: [] },
};

function getAvailableTransforms(capiParam: string) {
  const rules = PARAM_TRANSFORM_RULES[capiParam];
  if (!rules) return ALL_TRANSFORMS; // unknown param — show all
  return ALL_TRANSFORMS.filter(t => rules.available.includes(t.value));
}

function getMandatoryTransforms(capiParam: string): string[] {
  return PARAM_TRANSFORM_RULES[capiParam]?.mandatory ?? [];
}

// Meta Conversions API supported parameters
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
const SERVER_EVENT_PARAMS = [
  { key: 'event_name', label: 'Event Name', required: true, desc: 'The conversion event type (e.g. Purchase, Lead, AddToCart)' },
  { key: 'event_time', label: 'Event Time', required: true, desc: 'Unix timestamp when the event occurred' },
  { key: 'event_id', label: 'Event ID', required: false, desc: 'Unique ID for deduplication with browser pixel' },
  { key: 'action_source', label: 'Action Source', required: true, desc: 'Where the event occurred (website, email, phone_call, etc.)' },
  { key: 'event_source_url', label: 'Event Source URL', required: false, desc: 'URL where the event happened' },
  { key: 'opt_out', label: 'Opt Out', required: false, desc: 'Flag to not use this event for ads delivery optimization' },
  { key: 'data_processing_options', label: 'Data Processing Options', required: false, desc: 'Processing options for compliance (e.g. LDU)' },
  { key: 'data_processing_options_country', label: 'Data Processing Options Country', required: false, desc: 'Country code for data processing' },
  { key: 'data_processing_options_state', label: 'Data Processing Options State', required: false, desc: 'State code for data processing' },
  { key: 'advanced_measurement_table', label: 'Advanced Measurement Table', required: false, desc: 'Used for Aggregated Event Measurement' },
];

const USER_DATA_PARAMS = [
  { key: 'em', label: 'Email (em)', required: false, desc: 'Email address — hashed with SHA256' },
  { key: 'ph', label: 'Phone (ph)', required: false, desc: 'Phone number — hashed with SHA256' },
  { key: 'fn', label: 'First Name (fn)', required: false, desc: 'First name — hashed with SHA256' },
  { key: 'ln', label: 'Last Name (ln)', required: false, desc: 'Last name — hashed with SHA256' },
  { key: 'ge', label: 'Gender (ge)', required: false, desc: 'Gender (m or f) — hashed with SHA256' },
  { key: 'db', label: 'Date of Birth (db)', required: false, desc: 'YYYYMMDD format — hashed with SHA256' },
  { key: 'ct', label: 'City (ct)', required: false, desc: 'City — hashed with SHA256' },
  { key: 'st', label: 'State (st)', required: false, desc: 'Two-letter state code — hashed with SHA256' },
  { key: 'zp', label: 'Zip Code (zp)', required: false, desc: 'Zip/postal code — hashed with SHA256' },
  { key: 'country', label: 'Country', required: false, desc: 'Two-letter country code — hashed with SHA256' },
  { key: 'external_id', label: 'External ID', required: false, desc: 'Unique user ID from advertiser — hashed with SHA256' },
  { key: 'client_ip_address', label: 'Client IP Address', required: false, desc: 'User\'s IP address' },
  { key: 'client_user_agent', label: 'Client User Agent', required: false, desc: 'User\'s browser user agent string' },
  { key: 'fbc', label: 'Click ID (fbc)', required: false, desc: 'Facebook click ID from _fbc cookie' },
  { key: 'fbp', label: 'Browser ID (fbp)', required: false, desc: 'Facebook browser ID from _fbp cookie' },
  { key: 'subscription_id', label: 'Subscription ID', required: false, desc: 'Subscription ID for subscription events' },
  { key: 'lead_id', label: 'Lead ID', required: false, desc: 'Lead ID from Meta Lead Ads' },
  { key: 'fb_login_id', label: 'FB Login ID', required: false, desc: 'ID from Facebook Login' },
  { key: 'anon_id', label: 'Anonymous ID', required: false, desc: 'Anonymous ID for unregistered users' },
  { key: 'madid', label: 'Mobile Ad ID (madid)', required: false, desc: 'Mobile advertiser ID' },
  { key: 'ctwa_clid', label: 'CTWA Click ID', required: false, desc: 'Click-to-WhatsApp click ID' },
  { key: 'page_id', label: 'Page ID', required: false, desc: 'Facebook Page ID associated with the event' },
];

const CUSTOM_DATA_PARAMS = [
  { key: 'value', label: 'Value', required: false, desc: 'Monetary value of the conversion' },
  { key: 'currency', label: 'Currency', required: false, desc: 'ISO 4217 currency code (e.g. USD, EUR)' },
  { key: 'content_ids', label: 'Content IDs', required: false, desc: 'Product IDs associated with the event' },
  { key: 'content_type', label: 'Content Type', required: false, desc: 'Type of content (product or product_group)' },
  { key: 'content_name', label: 'Content Name', required: false, desc: 'Name of the content or product' },
  { key: 'content_category', label: 'Content Category', required: false, desc: 'Category of the content or product' },
  { key: 'contents', label: 'Contents', required: false, desc: 'Array of product objects with id, quantity, price' },
  { key: 'num_items', label: 'Number of Items', required: false, desc: 'Number of items in the transaction' },
  { key: 'order_id', label: 'Order ID', required: false, desc: 'Unique order/transaction ID' },
  { key: 'predicted_ltv', label: 'Predicted LTV', required: false, desc: 'Predicted lifetime value of the conversion' },
  { key: 'search_string', label: 'Search String', required: false, desc: 'Search query used by the user' },
  { key: 'status', label: 'Status', required: false, desc: 'Status of the registration event' },
  { key: 'delivery_category', label: 'Delivery Category', required: false, desc: 'Type of delivery (in_store, curbside, home_delivery)' },
];

let nextId = 0;
function makeId() {
  return `field_${nextId++}`;
}

function normalizeTransformNames(transforms: string[]): string[] {
  return [...new Set(transforms.map(t =>
    t === 'normalize_email' || t === 'normalize_phone' ? 'normalize' : t
  ))];
}

function parseDefaultMapping(mapping: Record<string, unknown>): MappingField[] {
  const fields: MappingField[] = [];

  for (const [key, val] of Object.entries(mapping)) {
    if (key === 'user_data' && typeof val === 'object' && val !== null) {
      for (const [udKey, udVal] of Object.entries(val as Record<string, unknown>)) {
        if (typeof udVal === 'object' && udVal !== null) {
          const v = udVal as Record<string, unknown>;
          fields.push({
            id: makeId(),
            capiParam: udKey,
            sourceColumn: (v.source as string) || '',
            transforms: normalizeTransformNames((v.transform as string[]) || []),
            group: 'user_data',
          });
        }
      }
    } else if (key === 'custom_data' && typeof val === 'object' && val !== null) {
      for (const [cdKey, cdVal] of Object.entries(val as Record<string, unknown>)) {
        if (typeof cdVal === 'object' && cdVal !== null) {
          const v = cdVal as Record<string, unknown>;
          fields.push({
            id: makeId(),
            capiParam: cdKey,
            sourceColumn: (v.source as string) || '',
            transforms: normalizeTransformNames((v.transform as string[]) || []),
            group: 'custom_data',
          });
        }
      }
    } else if (typeof val === 'object' && val !== null) {
      const v = val as Record<string, unknown>;
      fields.push({
        id: makeId(),
        capiParam: key,
        sourceColumn: (v.source as string) || '',
        transforms: normalizeTransformNames((v.transform as string[]) || []),
        group: 'server',
      });
    }
  }

  return fields;
}

interface MarketplaceData {
  installed: boolean;
  catalog_name?: string;
}

const JOB_STEPS = ['Column Mapping', 'Job Configuration'];

interface MeData {
  user_name: string;
  workspace: string;
  default_workspace_path?: string | null;
}

export default function JobSetup({ config, catalogOverride, onBack, onDone, onResourceCreated }: Props) {
  const [step, setStep] = useState(0);
  const [testEventCode, setTestEventCode] = useState(config.testEventCode || '');
  const [fields, setFields] = useState<MappingField[]>([]);
  const [sourceTable, setSourceTable] = useState(DEFAULT_CONVERSION_SOURCE_TABLE);
  const [tableTouched, setTableTouched] = useState(false);
  const [jobName, setJobName] = useState('Meta CAPI - Send Conversion Events');
  const [scheduleType, setScheduleType] = useState<'on_demand' | 'daily' | 'weekly'>('on_demand');
  const [weeklyDay, setWeeklyDay] = useState('MON');
  const [workspacePath, setWorkspacePath] = useState('/Workspace/Users/');
  const [pathTouched, setPathTouched] = useState(false);
  const secretScope = config.secretScope || 'meta-capi';
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; job_url?: string } | null>(null);

  // Table search
  const [tableResults, setTableResults] = useState<TableResult[]>([]);
  const [tableSearching, setTableSearching] = useState(false);
  const [showTableDropdown, setShowTableDropdown] = useState(false);
  const tableDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchTables = useCallback(async (query: string) => {
    if (!query) { setTableResults([]); return; }
    setTableSearching(true);
    try {
      const res = await fetch(`/api/search-tables?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setTableResults(data.tables ?? []);
      } else {
        setTableResults([]);
      }
    } catch {
      setTableResults([]);
    } finally {
      setTableSearching(false);
    }
  }, []);

  const handleTableInputChange = (value: string) => {
    setTableTouched(true);
    setSourceTable(value);
    setShowTableDropdown(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchTables(value), 300);
  };

  const tableInputRef = useRef<HTMLInputElement>(null);

  const handleTableSelect = (fullName: string, tableType: string | null) => {
    setSourceTable(fullName);
    setTableTouched(true);
    // If it's a catalog or schema, keep drilling down
    if (tableType === 'CATALOG' || tableType === 'SCHEMA') {
      setShowTableDropdown(true);
      searchTables(fullName);
      // Re-focus the input so user can keep typing
      setTimeout(() => tableInputRef.current?.focus(), 0);
    } else {
      setShowTableDropdown(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tableDropdownRef.current && !tableDropdownRef.current.contains(e.target as Node)) {
        setShowTableDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load user info for default workspace path
  const { data: me, loading: meLoading } = useApi<MeData>('/me');

  useEffect(() => {
    if (pathTouched || !me || meLoading) return;
    setWorkspacePath(me.default_workspace_path ?? '/Workspace/Users/');
  }, [me?.default_workspace_path, pathTouched, me, meLoading]);

  // Load default mapping from backend
  const { data: defaultMapping } = useApi<DefaultMapping>('/default-mapping');
  const { data: marketplace } = useApi<MarketplaceData>('/marketplace-listing');

  // Resolve catalog name: prefer marketplace detection, fall back to user override
  const resolvedCatalog = (marketplace?.installed && marketplace.catalog_name)
    ? marketplace.catalog_name
    : catalogOverride || null;

  // When catalog is known, replace {marketplace_catalog} placeholder
  useEffect(() => {
    if (resolvedCatalog && !tableTouched) {
      setSourceTable(prev =>
        prev.replace('{marketplace_catalog}', resolvedCatalog)
      );
    }
  }, [resolvedCatalog, tableTouched]);

  useEffect(() => {
    if (defaultMapping?.mapping) {
      const m = defaultMapping.mapping as Record<string, unknown>;
      if (typeof m.source_table === 'string' && m.source_table.trim()) {
        let table = m.source_table.trim();
        if (resolvedCatalog) {
          table = table.replace('{marketplace_catalog}', resolvedCatalog);
        }
        if (!tableTouched) {
          setSourceTable(table);
        }
      }
      setFields(parseDefaultMapping(defaultMapping.mapping));
    }
  }, [defaultMapping, resolvedCatalog, tableTouched]);

  const addField = (group: 'server' | 'user_data' | 'custom_data') => {
    setFields([...fields, {
      id: makeId(),
      capiParam: '',
      sourceColumn: '',
      transforms: [],
      group,
    }]);
  };

  const updateField = (id: string, updates: Partial<MappingField>) => {
    setFields(fields.map(f => {
      if (f.id !== id) return f;
      const updated = { ...f, ...updates };
      // When parameter changes, auto-apply mandatory transforms
      if (updates.capiParam !== undefined) {
        const mandatory = getMandatoryTransforms(updates.capiParam);
        const available = getAvailableTransforms(updates.capiParam).map(t => t.value);
        // Keep only transforms that are available for the new param, then add mandatory ones
        const kept = updated.transforms.filter(t => available.includes(t));
        updated.transforms = [...new Set([...kept, ...mandatory])];
      }
      return updated;
    }));
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const toggleTransform = (id: string, transform: string) => {
    const field = fields.find(f => f.id === id);
    if (!field) return;
    const mandatory = getMandatoryTransforms(field.capiParam);
    // Don't allow deselecting mandatory transforms
    if (mandatory.includes(transform) && field.transforms.includes(transform)) return;
    const transforms = field.transforms.includes(transform)
      ? field.transforms.filter(t => t !== transform)
      : [...field.transforms, transform];
    updateField(id, { transforms });
  };

  const getParamOptions = (group: 'server' | 'user_data' | 'custom_data') => {
    if (group === 'server') return SERVER_EVENT_PARAMS;
    if (group === 'user_data') return USER_DATA_PARAMS;
    return CUSTOM_DATA_PARAMS;
  };

  const validateMapping = (): string[] => {
    const errors: string[] = [];

    // Check source table
    if (!sourceTable.trim()) {
      errors.push('Conversion Data Location is required.');
    }

    // Check required server event params are present
    const requiredServerParams = SERVER_EVENT_PARAMS.filter(p => p.required);
    const mappedServerParams = fields.filter(f => f.group === 'server' && f.capiParam).map(f => f.capiParam);
    for (const param of requiredServerParams) {
      if (!mappedServerParams.includes(param.key)) {
        errors.push(`Required parameter "${param.label}" is missing.`);
      }
    }

    // Check all mapped fields have a source column
    for (const field of fields) {
      if (field.capiParam && !field.sourceColumn.trim()) {
        const allParams = [...SERVER_EVENT_PARAMS, ...USER_DATA_PARAMS, ...CUSTOM_DATA_PARAMS];
        const label = allParams.find(p => p.key === field.capiParam)?.label || field.capiParam;
        errors.push(`"${label}" is missing a source column.`);
      }
    }

    // Check at least one user_data field for matching
    const userDataFields = fields.filter(f => f.group === 'user_data' && f.capiParam && f.sourceColumn.trim());
    if (userDataFields.length === 0) {
      errors.push('At least one User Data parameter (e.g. Email, Phone) is recommended for event matching.');
    }

    return errors;
  };

  const handleNextStep = () => {
    const errors = validateMapping();
    setValidationErrors(errors);
    // Allow proceeding with warnings (user_data recommendation) but block on hard errors
    const hardErrors = errors.filter(e => !e.includes('recommended'));
    if (hardErrors.length === 0) {
      setStep(1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await postApi<{ success: boolean; message: string; job_url?: string }>('/create-job', {
        config: {
          pixel_id: config.pixelId,
          test_event_code: testEventCode || null,
        },
        source_table: sourceTable.trim() || DEFAULT_CONVERSION_SOURCE_TABLE,
        fields: fields.map(f => ({
          capi_param: f.capiParam,
          source_column: f.sourceColumn,
          transforms: f.transforms,
          group: f.group,
        })),
        job_name: jobName,
        schedule_type: scheduleType,
        schedule: scheduleType === 'daily' ? '0 0 * * *'
          : scheduleType === 'weekly' ? `0 0 * * ${weeklyDay}`
          : '',
        workspace_path: workspacePath,
        secret_scope: secretScope,
      });
      setResult(res);
      if (res.success && res.job_url && onResourceCreated) {
        onResourceCreated({
          type: 'job',
          url: res.job_url,
          name: jobName,
          createdAt: new Date().toISOString(),
          testEventCode: testEventCode || undefined,
        });
      }
    } catch (err: unknown) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to create job',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderFieldRow = (field: MappingField) => {
    const paramOptions = getParamOptions(field.group);
    const selectedParam = paramOptions.find(p => p.key === field.capiParam);

    return (
      <div key={field.id} className="d-flex align-items-start gap-2 mb-2 p-2 rounded" style={{ background: 'var(--meta-bg-alt)' }}>
        <div style={{ flex: 2 }}>
          <Form.Select
            size="sm"
            aria-label="CAPI parameter"
            value={field.capiParam}
            onChange={(e) => updateField(field.id, { capiParam: e.target.value })}
          >
            <option value="">Select parameter...</option>
            {paramOptions.map(p => (
              <option key={p.key} value={p.key}>
                {p.label} {p.required ? '*' : ''}
              </option>
            ))}
          </Form.Select>
          {selectedParam && (
            <div className="text-muted mt-1" style={{ fontSize: 11 }}>{selectedParam.desc}</div>
          )}
        </div>
        <div style={{ flex: 2 }}>
          <Form.Control
            size="sm"
            type="text"
            aria-label="Source column name"
            placeholder="Source column name"
            value={field.sourceColumn}
            onChange={(e) => updateField(field.id, { sourceColumn: e.target.value })}
          />
        </div>
        <div style={{ flex: 2 }}>
          {(() => {
            const available = getAvailableTransforms(field.capiParam);
            const mandatory = getMandatoryTransforms(field.capiParam);
            if (available.length === 0) {
              return <span className="text-muted" style={{ fontSize: 12 }}>None</span>;
            }
            return (
              <div className="d-flex flex-wrap gap-1">
                {available.map(t => {
                  const isActive = field.transforms.includes(t.value);
                  const isMandatory = mandatory.includes(t.value);
                  return (
                    <Badge
                      key={t.value}
                      bg={isActive ? 'primary' : 'light'}
                      text={isActive ? 'white' : 'dark'}
                      role="button"
                      style={{
                        cursor: isMandatory ? 'default' : 'pointer',
                        fontSize: 10,
                        fontWeight: 500,
                        opacity: isMandatory && isActive ? 0.85 : 1,
                      }}
                      onClick={() => toggleTransform(field.id, t.value)}
                      title={isMandatory ? `${t.label} (required)` : t.label}
                    >
                      {t.label}
                      {isMandatory && <i className="fa-solid fa-lock ms-1" style={{ fontSize: 8 }} />}
                    </Badge>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => removeField(field.id)}
          style={{ flexShrink: 0 }}
        >
          <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
        </Button>
      </div>
    );
  };

  if (result) {
    return (
      <Card style={{ maxWidth: 640, width: '100%' }}>
        <Card.Body className="p-5 text-center">
          <div className="mb-3">
            <i
              className={`fa-solid ${result.success ? 'fa-circle-check' : 'fa-circle-xmark'}`}
              style={{ fontSize: '2.5rem', color: result.success ? '#31A24C' : '#E4002B' }}
            />
          </div>
          <Alert variant={result.success ? 'success' : 'danger'} className="border-0">
            {result.message}
          </Alert>
          {result.success && result.job_url && (
            <a
              href={result.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary mb-3"
            >
              <i className="fa-solid fa-arrow-up-right-from-square me-1" />
              Open Job
            </a>
          )}
          <div>
            <Button variant="outline-secondary" onClick={onDone}>
              Back to Home
            </Button>
          </div>
        </Card.Body>
      </Card>
    );
  }

  const serverFields = fields.filter(f => f.group === 'server');
  const userDataFields = fields.filter(f => f.group === 'user_data');
  const customDataFields = fields.filter(f => f.group === 'custom_data');

  const progress = ((step + 1) / JOB_STEPS.length) * 100;

  return (
    <Card style={{ maxWidth: 860, width: '100%' }}>
      <Card.Header className="py-3 px-4">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            <i className="fa-solid fa-gears me-2" style={{ color: 'var(--meta-blue)' }} />
            Step {step + 1} of {JOB_STEPS.length} — {JOB_STEPS[step]}
          </span>
          <a
            href="https://developers.facebook.com/docs/marketing-api/conversions-api/parameters"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12 }}
          >
            Supported Parameters
            <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 10 }} />
          </a>
        </div>
        <ProgressBar now={progress} style={{ height: 3 }} />
      </Card.Header>

      <Card.Body className="p-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {/* Step 1: Column Mapping */}
        {step === 0 && (
          <>
            <Form.Group className="mb-4" controlId="job-testEventCode">
              <Form.Label style={{ fontWeight: 600, fontSize: 13 }}>Event Test Code</Form.Label>
              <Form.Control
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="Optional — e.g. TEST12345"
              />
              <Form.Text className="text-muted">
                Optional. Use a{' '}
                <a
                  href="https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api#testEvents"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  test code
                  <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 10 }} />
                </a>{' '}
                to verify events in Meta Events Manager before sending production data.
              </Form.Text>
            </Form.Group>

            <div
              className="mb-4 p-3 rounded"
              style={{ background: 'var(--meta-bg-alt)', border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <Form.Group className="mb-0" controlId="job-sourceTable">
                <Form.Label style={{ fontWeight: 600, fontSize: 13 }}>Conversion Data Location</Form.Label>
                <div ref={tableDropdownRef} style={{ position: 'relative' }}>
                  <div className="d-flex align-items-center">
                    <Form.Control
                      ref={tableInputRef}
                      type="text"
                      value={sourceTable}
                      onChange={(e) => handleTableInputChange(e.target.value)}
                      onFocus={() => { if (tableResults.length > 0) setShowTableDropdown(true); }}
                      placeholder={DEFAULT_CONVERSION_SOURCE_TABLE}
                      style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
                      autoComplete="off"
                    />
                    {tableSearching && (
                      <Spinner
                        animation="border"
                        size="sm"
                        style={{ position: 'absolute', right: 10, color: '#999' }}
                      />
                    )}
                  </div>
                  {showTableDropdown && tableResults.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1050,
                        background: '#fff',
                        border: '1px solid rgba(0,0,0,0.15)',
                        borderRadius: 6,
                        maxHeight: 220,
                        overflowY: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    >
                      {tableResults.map((t) => {
                        const isBrowsable = t.table_type === 'CATALOG' || t.table_type === 'SCHEMA';
                        return (
                          <div
                            key={t.full_name}
                            role="button"
                            onClick={() => handleTableSelect(t.full_name, t.table_type)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontFamily: 'ui-monospace, monospace',
                              borderBottom: '1px solid rgba(0,0,0,0.05)',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget).style.background = 'var(--meta-bg-alt)'; }}
                            onMouseLeave={(e) => { (e.currentTarget).style.background = '#fff'; }}
                          >
                            <div className="d-flex justify-content-between align-items-center">
                              <span>{t.name}</span>
                              {isBrowsable ? (
                                <i className="fa-solid fa-chevron-right text-muted" style={{ fontSize: 10 }} />
                              ) : (
                                <span className="text-muted" style={{ fontSize: 11 }}>
                                  {(t.table_type || '').replace('TableType.', '')}
                                </span>
                              )}
                            </div>
                            {!isBrowsable && (
                              <div className="text-muted" style={{ fontSize: 11 }}>{t.full_name}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Form.Text className="text-muted" style={{ fontSize: 12 }}>
                  Type to search Unity Catalog tables. Defaults to the{' '}
                  <a
                    href={`${me?.workspace || ''}/marketplace/consumer/listings/${LISTING_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >sample dataset</a>: <code>{resolvedCatalog ? DEFAULT_CONVERSION_SOURCE_TABLE.replace('{marketplace_catalog}', resolvedCatalog) : DEFAULT_CONVERSION_SOURCE_TABLE}</code>
                </Form.Text>
              </Form.Group>
            </div>

            <h6 className="mb-2" style={{ fontWeight: 600, fontSize: 14 }}>
              Conversion Column Mapping
            </h6>
            <p className="text-muted mb-1" style={{ fontSize: 13 }}>
              Map columns from that table to Meta Conversions API parameters. Select a parameter,
              specify the source column name, and optionally apply transformations.
            </p>
            <ul className="text-muted mb-3 ps-3" style={{ fontSize: 13 }}>
              <li><strong>*</strong> denotes required parameter by Meta.</li>
              <li><i className="fa-solid fa-lock" style={{ fontSize: 9 }} /> denotes mandatory transformations per Meta's spec.</li>
            </ul>

            <Accordion alwaysOpen>
              <Accordion.Item eventKey="0">
                <Accordion.Header>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    Server Event Parameters
                    <Badge bg="secondary" className="ms-2" style={{ fontSize: 10 }}>{serverFields.length}</Badge>
                  </span>
                </Accordion.Header>
                <Accordion.Body className="p-2">
                  <div className="d-flex gap-2 mb-2 px-2" style={{ fontSize: 11, fontWeight: 600, color: 'var(--meta-text-secondary)' }}>
                    <div style={{ flex: 2 }}>CAPI PARAMETER</div>
                    <div style={{ flex: 2 }}>SOURCE COLUMN</div>
                    <div style={{ flex: 2 }}>TRANSFORMATIONS</div>
                    <div style={{ width: 38 }}></div>
                  </div>
                  {serverFields.map(renderFieldRow)}
                  <Button variant="link" size="sm" className="mt-1" onClick={() => addField('server')}>
                    <i className="fa-solid fa-plus me-1" />
                    Add Server Event Parameter
                  </Button>
                </Accordion.Body>
              </Accordion.Item>

              <Accordion.Item eventKey="1">
                <Accordion.Header>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    User Data (user_data)
                    <Badge bg="secondary" className="ms-2" style={{ fontSize: 10 }}>{userDataFields.length}</Badge>
                  </span>
                </Accordion.Header>
                <Accordion.Body className="p-2">
                  <div className="d-flex gap-2 mb-2 px-2" style={{ fontSize: 11, fontWeight: 600, color: 'var(--meta-text-secondary)' }}>
                    <div style={{ flex: 2 }}>CAPI PARAMETER</div>
                    <div style={{ flex: 2 }}>SOURCE COLUMN</div>
                    <div style={{ flex: 2 }}>TRANSFORMATIONS</div>
                    <div style={{ width: 38 }}></div>
                  </div>
                  {userDataFields.map(renderFieldRow)}
                  <Button variant="link" size="sm" className="mt-1" onClick={() => addField('user_data')}>
                    <i className="fa-solid fa-plus me-1" />
                    Add User Data Parameter
                  </Button>
                </Accordion.Body>
              </Accordion.Item>

              <Accordion.Item eventKey="2">
                <Accordion.Header>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    Custom Data (custom_data)
                    <Badge bg="secondary" className="ms-2" style={{ fontSize: 10 }}>{customDataFields.length}</Badge>
                  </span>
                </Accordion.Header>
                <Accordion.Body className="p-2">
                  <div className="d-flex gap-2 mb-2 px-2" style={{ fontSize: 11, fontWeight: 600, color: 'var(--meta-text-secondary)' }}>
                    <div style={{ flex: 2 }}>CAPI PARAMETER</div>
                    <div style={{ flex: 2 }}>SOURCE COLUMN</div>
                    <div style={{ flex: 2 }}>TRANSFORMATIONS</div>
                    <div style={{ width: 38 }}></div>
                  </div>
                  {customDataFields.map(renderFieldRow)}
                  <Button variant="link" size="sm" className="mt-1" onClick={() => addField('custom_data')}>
                    <i className="fa-solid fa-plus me-1" />
                    Add Custom Data Parameter
                  </Button>
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>

            {validationErrors.length > 0 && (
              <Alert variant="warning" className="mt-3 py-2">
                <div className="mb-1" style={{ fontWeight: 600, fontSize: 13 }}>
                  <i className="fa-solid fa-triangle-exclamation me-1" />
                  Please fix the following before continuing:
                </div>
                <ul className="mb-0 ps-3" style={{ fontSize: 13 }}>
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </>
        )}

        {/* Step 2: Job Configuration */}
        {step === 1 && (
          <>
            <h5 className="mb-3" style={{ fontWeight: 600 }}>Job Configuration</h5>
            <p className="text-muted mb-4" style={{ fontSize: 14 }}>
              Configure the Databricks Job that will run the notebook.
            </p>

            <Form>
              <Form.Group className="mb-3" controlId="job-name">
                <Form.Label>Job Name</Form.Label>
                <Form.Control
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="job-schedule">
                <Form.Label>Schedule</Form.Label>
                <Form.Select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value as 'on_demand' | 'daily' | 'weekly')}
                >
                  <option value="on_demand">On Demand (manual trigger)</option>
                  <option value="daily">Daily (midnight UTC)</option>
                  <option value="weekly">Weekly</option>
                </Form.Select>
                {scheduleType === 'on_demand' && (
                  <Form.Text className="text-muted">
                    No schedule — run the job manually from the Databricks workspace.
                  </Form.Text>
                )}
              </Form.Group>
              {scheduleType === 'weekly' && (
                <Form.Group className="mb-3" controlId="job-weeklyDay">
                  <Form.Label>Day of Week</Form.Label>
                  <Form.Select
                    value={weeklyDay}
                    onChange={(e) => setWeeklyDay(e.target.value)}
                  >
                    <option value="MON">Monday</option>
                    <option value="TUE">Tuesday</option>
                    <option value="WED">Wednesday</option>
                    <option value="THU">Thursday</option>
                    <option value="FRI">Friday</option>
                    <option value="SAT">Saturday</option>
                    <option value="SUN">Sunday</option>
                  </Form.Select>
                </Form.Group>
              )}
            </Form>

            <div
              className="mt-4"
              role="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--meta-text-secondary)' }}
            >
              <i className={`fa-solid fa-chevron-${showAdvanced ? 'down' : 'right'} me-2`} style={{ fontSize: 11 }} />
              Advanced Settings
            </div>

            {showAdvanced && (
              <div className="mt-3">
                <Form>
                  <Form.Group className="mb-3" controlId="job-workspacePath">
                    <Form.Label>Workspace Path</Form.Label>
                    <Form.Control
                      type="text"
                      value={workspacePath}
                      onChange={(e) => { setPathTouched(true); setWorkspacePath(e.target.value); }}
                      placeholder="/Workspace/Users/you@company.com"
                    />
                    <Form.Text className="text-muted">
                      The notebook and mapping YAML will be uploaded to this path.
                    </Form.Text>
                  </Form.Group>
                </Form>
              </div>
            )}

            <div
              className="mt-3"
              role="button"
              onClick={() => setShowJson(!showJson)}
              style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--meta-text-secondary)' }}
            >
              <i className={`fa-solid fa-chevron-${showJson ? 'down' : 'right'} me-2`} style={{ fontSize: 11 }} />
              Export as JSON
            </div>

            {showJson && (() => {
              const cronExpr = scheduleType === 'daily' ? '0 0 * * *'
                : scheduleType === 'weekly' ? `0 0 * * ${weeklyDay}`
                : null;
              const jobJson = {
                name: jobName,
                tasks: [{
                  task_key: 'send_conversion_events',
                  notebook_task: {
                    notebook_path: `${workspacePath.replace(/\/$/, '')}/Meta CAPI - UDTF Example`,
                    base_parameters: {
                      pixel_id: config.pixelId,
                      test_event_code: testEventCode || '',
                      secret_scope: secretScope,
                      delta_share_catalog: sourceTable.split('.')[0] || 'meta_capi_sample_data',
                      api_version: 'v24.0',
                    },
                  },
                }],
                ...(cronExpr ? {
                  schedule: {
                    quartz_cron_expression: `CRON ${cronExpr}`,
                    timezone_id: 'UTC',
                    pause_status: 'PAUSED',
                  },
                } : {}),
              };
              const jsonStr = JSON.stringify(jobJson, null, 2);
              return (
                <div className="mt-2">
                  <p className="text-muted mb-2" style={{ fontSize: 13 }}>
                    Copy this JSON into your repo to create the job via CLI or API instead.
                  </p>
                  <div className="position-relative">
                    <pre
                      className="p-3 rounded"
                      style={{
                        background: 'var(--meta-nav-bg)',
                        color: '#e0e0e0',
                        fontSize: 12,
                        maxHeight: 300,
                        overflow: 'auto',
                      }}
                    >
                      {jsonStr}
                    </pre>
                    <Button
                      variant="outline-light"
                      size="sm"
                      className="position-absolute"
                      style={{ top: 8, right: 8 }}
                      onClick={() => navigator.clipboard.writeText(jsonStr)}
                    >
                      <i className="fa-solid fa-copy me-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </Card.Body>

      <Card.Footer className="d-flex justify-content-between py-3 px-4">
        <Button
          variant="outline-secondary"
          onClick={step === 0 ? onBack : () => { setValidationErrors([]); setStep(0); }}
        >
          <i className="fa-solid fa-arrow-left me-1" style={{ fontSize: 12 }} />
          {step === 0 ? 'Back' : 'Back to Mapping'}
        </Button>
        {step === 0 ? (
          <Button variant="primary" onClick={handleNextStep}>
            Next: Job Configuration
            <i className="fa-solid fa-arrow-right ms-1" style={{ fontSize: 12 }} />
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin me-1" />
                Creating Job...
              </>
            ) : (
              <>
                <i className="fa-solid fa-check me-1" />
                Create Job
              </>
            )}
          </Button>
        )}
      </Card.Footer>
    </Card>
  );
}
