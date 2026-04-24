import { useState, useEffect } from 'react';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import ListGroup from 'react-bootstrap/ListGroup';
import { postApi, useApi } from '../hooks/useApi';
import type { CAPIConfig } from '../App';

const LISTING_ID = '8a8f4ead-db28-45e9-b39b-aabbbe1dbe08';
const DEFAULT_SOURCE_TABLE = '{marketplace_catalog}.meta_capi.conversion_data';

interface MeData {
  user_name: string;
  workspace: string;
}

interface MarketplaceData {
  installed: boolean;
  catalog_name?: string;
}

interface RunResult {
  success: boolean;
  message: string;
  events_sent?: number;
  events_failed?: number;
  total_events?: number;
  total_rows?: number;
  mapped_events?: number;
  mapping_errors?: number;
  batches?: number;
  errors?: string[];
}

interface Props {
  config: CAPIConfig;
  catalogOverride?: string | null;
  onBack: () => void;
  onDone: () => void;
}

export default function QuickStart({ config, catalogOverride, onBack, onDone }: Props) {
  const { data: me } = useApi<MeData>('/me');
  const { data: marketplace } = useApi<MarketplaceData>('/marketplace-listing');

  const [testEventCode, setTestEventCode] = useState(config.testEventCode || '');
  const [sourceTable, setSourceTable] = useState(DEFAULT_SOURCE_TABLE);
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: Record<string, string>[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    setShowPreview(true);
    if (previewData) return; // use cached data
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await postApi<{ success: boolean; message?: string; columns?: string[]; rows?: Record<string, string>[] }>(
        '/preview-table',
        { source_table: sourceTable }
      );
      if (!res.success) {
        setPreviewError(res.message || 'Preview failed');
      } else {
        setPreviewData({ columns: res.columns || [], rows: res.rows || [] });
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Resolve catalog: prefer marketplace detection, fall back to user override
  const resolvedCatalog = (marketplace?.installed && marketplace.catalog_name)
    ? marketplace.catalog_name
    : catalogOverride || null;

  // Set default source table when catalog is known
  useEffect(() => {
    if (resolvedCatalog) {
      setSourceTable(`${resolvedCatalog}.meta_capi.conversion_data`);
    }
  }, [resolvedCatalog]);

  // Progress through status steps while running
  useEffect(() => {
    if (!running) { setRunStep(0); return; }
    const timers = [
      setTimeout(() => setRunStep(1), 800),
      setTimeout(() => setRunStep(2), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [running]);

  const RUN_STEPS = [
    'Reading YAML configuration...',
    'Reading table...',
    'Sending events to Meta CAPI...',
  ];

  const handleRun = async () => {
    setRunning(true);
    setRunStep(0);
    setResult(null);

    try {
      const res = await postApi<RunResult>('/run-quick-start', {
        pixel_id: config.pixelId,
        test_event_code: testEventCode || '',
        source_table: sourceTable,
        secret_scope: config.secretScope || '',
        secret_key: config.secretKey || 'access_token',
        catalog: resolvedCatalog || '',
      });
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        message: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        errors: [String(err)],
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card style={{ maxWidth: 560, width: '100%' }}>
      <Card.Header className="py-3 px-4">
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          <i className="fa-solid fa-bolt me-2" style={{ color: 'var(--meta-blue)' }} />
          Quick Start — Run with{' '}
          <a
            href={`${me?.workspace || ''}/marketplace/consumer/listings/${LISTING_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >Sample Dataset</a>
        </span>
      </Card.Header>

      <Card.Body className="p-4">
        {running ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" className="mb-3" />
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {RUN_STEPS[runStep]}
            </div>
            <div className="text-muted mt-2" style={{ fontSize: 13 }}>
              {RUN_STEPS.map((label, i) => (
                <div key={i} className="d-flex align-items-center justify-content-center gap-2 mb-1">
                  {i < runStep ? (
                    <i className="fa-solid fa-circle-check" style={{ color: '#31A24C', fontSize: 12 }} />
                  ) : i === runStep ? (
                    <Spinner animation="border" size="sm" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  ) : (
                    <i className="fa-regular fa-circle" style={{ color: '#ccc', fontSize: 12 }} />
                  )}
                  <span style={{ color: i <= runStep ? '#333' : '#adb5bd' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : !result ? (
          <>
            <p className="text-muted" style={{ fontSize: 14 }}>
              Read from the sample dataset, apply the default column mapping, and send
              conversion events to Meta — all in one step. Confirm the settings below and hit Run.
            </p>

            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                Event Test Code
              </Form.Label>
              <Form.Control
                size="sm"
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

            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                Sample Dataset Location
              </Form.Label>
              <Form.Control
                size="sm"
                type="text"
                value={sourceTable}
                onChange={(e) => {
                  setSourceTable(e.target.value);
                  setPreviewData(null);
                  setPreviewError(null);
                }}
                placeholder="catalog.schema.table"
              />
              <Form.Text className="text-muted">
                The Databricks Marketplace sample table containing conversion events.
              </Form.Text>
              {sourceTable.trim() && (
                <div className="mt-2">
                  <div
                    role="button"
                    onClick={handlePreview}
                    style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--meta-blue, #0866FF)' }}
                  >
                    <i className={`fa-solid fa-${showPreview ? 'chevron-down' : 'table'} me-1`} style={{ fontSize: 11 }} />
                    {showPreview ? 'Hide Preview' : 'Preview Sample Data'}
                  </div>
                  {showPreview && (
                    <div className="mt-2">
                      {previewLoading && (
                        <div className="text-muted d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                          <Spinner animation="border" size="sm" />
                          Loading preview...
                        </div>
                      )}
                      {previewError && (
                        <Alert variant="danger" className="py-2 small mb-0">
                          <i className="fa-solid fa-circle-xmark me-1" />
                          {previewError}
                        </Alert>
                      )}
                      {previewData && previewData.rows.length > 0 && (
                        <div style={{ overflowX: 'auto', fontSize: 11 }}>
                          <table className="table table-sm table-bordered mb-0" style={{ fontSize: 11 }}>
                            <thead style={{ background: '#f8f9fa' }}>
                              <tr>
                                {previewData.columns.map(col => (
                                  <th key={col} style={{ whiteSpace: 'nowrap', padding: '4px 8px' }}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.rows.map((row, i) => (
                                <tr key={i}>
                                  {previewData.columns.map(col => (
                                    <td key={col} style={{ whiteSpace: 'nowrap', padding: '4px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {row[col] ?? '—'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                            Showing {previewData.rows.length} row{previewData.rows.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                      {previewData && previewData.rows.length === 0 && (
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          No rows found in this table.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Form.Group>

            <div className="d-flex justify-content-between mt-4">
              <Button variant="outline-secondary" size="sm" onClick={onBack}>
                <i className="fa-solid fa-arrow-left me-1" />
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleRun}
                disabled={!sourceTable.trim() || !config.secretScope}
              >
                <i className="fa-solid fa-play me-1" />
                Run Now
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert
              variant={
                result.success ? 'success'
                : (result.events_sent ?? 0) > 0 ? 'warning'
                : 'danger'
              }
              className="mb-3"
            >
              <i className={`fa-solid ${
                result.success ? 'fa-circle-check'
                : (result.events_sent ?? 0) > 0 ? 'fa-triangle-exclamation'
                : 'fa-circle-xmark'
              } me-2`} />
              <strong>{result.message}</strong>
            </Alert>

            <ListGroup variant="flush" className="mb-3">
              {result.total_rows != null && (
                <ListGroup.Item className="d-flex justify-content-between px-0 py-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Rows loaded</span>
                  <span className="fw-medium">{result.total_rows}</span>
                </ListGroup.Item>
              )}
              {result.mapped_events != null && (
                <ListGroup.Item className="d-flex justify-content-between px-0 py-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Events mapped</span>
                  <span className="fw-medium">{result.mapped_events}</span>
                </ListGroup.Item>
              )}
              {(result.events_sent ?? 0) > 0 && (
                <ListGroup.Item className="d-flex justify-content-between px-0 py-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Events sent</span>
                  <span className="fw-medium" style={{ color: '#31A24C' }}>
                    {result.events_sent}
                  </span>
                </ListGroup.Item>
              )}
              {(result.events_failed ?? 0) > 0 && (
                <ListGroup.Item className="d-flex justify-content-between px-0 py-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Events failed</span>
                  <span className="fw-medium" style={{ color: '#E4002B' }}>
                    {result.events_failed}
                  </span>
                </ListGroup.Item>
              )}
              {(result.batches ?? 0) > 0 && (
                <ListGroup.Item className="d-flex justify-content-between px-0 py-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Batches</span>
                  <span className="fw-medium">{result.batches}</span>
                </ListGroup.Item>
              )}
              {(result.mapping_errors ?? 0) > 0 && (
                <ListGroup.Item className="d-flex justify-content-between px-0 py-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Mapping errors</span>
                  <span className="fw-medium text-warning">{result.mapping_errors}</span>
                </ListGroup.Item>
              )}
            </ListGroup>

            {(result.events_sent ?? 0) > 0 && (
              <div className="text-muted mb-3" style={{ fontSize: 12 }}>
                <i className="fa-solid fa-clock me-1" />
                Events should appear in{' '}
                <a
                  href="https://www.facebook.com/business/tools/ads-manager"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Meta Ads Manager
                  <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 9 }} />
                </a>
                {' '}within 30 minutes.
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <details className="mb-3">
                <summary style={{ fontSize: 13, cursor: 'pointer' }}>
                  Error details ({result.errors.length})
                </summary>
                <pre
                  className="mt-2 p-2 bg-light rounded"
                  style={{ fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}
                >
                  {result.errors.join('\n')}
                </pre>
              </details>
            )}

            <div className="d-flex justify-content-between">
              <Button variant="outline-secondary" size="sm" onClick={onBack}>
                <i className="fa-solid fa-arrow-left me-1" />
                Back
              </Button>
              <div className="d-flex gap-2">
                {!result.success && (
                  <Button variant="outline-primary" size="sm" onClick={() => setResult(null)}>
                    <i className="fa-solid fa-rotate-right me-1" />
                    Try Again
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={onDone}>
                  Done
                </Button>
              </div>
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
