import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

interface Props {
  onQuickStart: () => void;
  onQuickLaunch: () => void;
  onJobSetup: () => void;
  onBack: () => void;
}

export default function PostSetupOptions({ onQuickStart, onQuickLaunch, onJobSetup, onBack }: Props) {
  return (
    <div style={{ maxWidth: 720, width: '100%' }}>
      <div className="text-center mb-4">
        <h4 style={{ fontWeight: 600 }}>What would you like to do next?</h4>
        <p className="text-muted" style={{ fontSize: 15 }}>
          Choose how you'd like to get started with the Conversions API.
        </p>
      </div>

      <Row className="g-3">
        <Col md={4}>
          <Card className="h-100 launch-tile text-center">
            <Card.Body className="p-4 d-flex flex-column">
              <div className="mb-3">
                <i className="fa-solid fa-bolt" style={{ fontSize: '2rem', color: 'var(--meta-blue)' }} />
              </div>
              <Card.Title as="h5" style={{ fontWeight: 600 }}>
                Quick Start
              </Card.Title>
              <Card.Text className="text-muted flex-grow-1" style={{ fontSize: 14 }}>
                Run the Databricks Marketplace sample dataset immediately and see results.
                Fastest way to validate your connection.
              </Card.Text>
              <Button variant="primary" onClick={onQuickStart}>
                <i className="fa-solid fa-play me-1" />
                Run Now
              </Button>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="h-100 launch-tile text-center">
            <Card.Body className="p-4 d-flex flex-column">
              <div className="mb-3">
                <i className="fa-solid fa-rocket" style={{ fontSize: '2rem', color: 'var(--meta-blue)' }} />
              </div>
              <Card.Title as="h5" style={{ fontWeight: 600 }}>
                Deploy Notebook
              </Card.Title>
              <Card.Text className="text-muted flex-grow-1" style={{ fontSize: 14 }}>
                Deploy a ready-to-run notebook with sample data to your workspace.
                Easiest way to make quick adjustments to the table or query for delivery and test at your own pace.
              </Card.Text>
              <Button variant="outline-primary" onClick={onQuickLaunch}>
                <i className="fa-solid fa-rocket me-1" />
                Deploy
              </Button>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="h-100 launch-tile text-center">
            <Card.Body className="p-4 d-flex flex-column">
              <div className="mb-3">
                <i className="fa-solid fa-gears" style={{ fontSize: '2rem', color: 'var(--meta-blue)' }} />
              </div>
              <Card.Title as="h5" style={{ fontWeight: 600 }}>
                Set Up a Job
              </Card.Title>
              <Card.Text className="text-muted flex-grow-1" style={{ fontSize: 14 }}>
                Configure column mappings for your own data and set up a
                recurring job to send conversion events.
              </Card.Text>
              <Button variant="outline-primary" onClick={onJobSetup}>
                <i className="fa-solid fa-wrench me-1" />
                Configure Job
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="text-center mt-4">
        <Button variant="link" className="text-muted" onClick={onBack}>
          <i className="fa-solid fa-arrow-left me-1" style={{ fontSize: 12 }} />
          Back to Home
        </Button>
      </div>
    </div>
  );
}
