from __future__ import annotations
import hashlib
from datetime import date, datetime
import yaml
import json
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version
import requests
globals().update(locals())




class MappingEngine:
    def __init__(self, mapping_yaml: str):
        self.mapping = yaml.safe_load(mapping_yaml)

    def transform_row(self, row: Any) -> dict[str, Any]:
        """
        Transforms a Spark Row into a Meta CAPI event dictionary based on the YAML mapping.
        """
        event = {}
        for field, rule in self.mapping.items():
            # Skip special keys if we add metadata later
            if field in ['version', 'meta']:
                continue

            value = self._apply_rule(rule, row)
            if value is not None:
                event[field] = value
        return event

    def _apply_rule(self, rule: Any, row: Any) -> Any:
        # Handle simple string mapping (shorthand for column source)
        if isinstance(rule, str):
            return rule

        if isinstance(rule, dict):
            # Explicit Literal
            if rule.get('type') == 'literal':
                return rule.get('value')

            # Column Reference
            if 'source' in rule:
                col_name = rule['source']
                val = getattr(row, col_name)

                # Apply transforms
                if 'transform' in rule:
                    transforms = rule['transform']
                    if isinstance(transforms, str):
                        transforms = [transforms]

                    for t in transforms:
                        val = self._apply_transform(t, val)

                return val

            # Nested Object (e.g., user_data, custom_data)
            nested_obj = {}
            for k, v in rule.items():
                val = self._apply_rule(v, row)
                if val is not None:
                    nested_obj[k] = val
            return nested_obj if nested_obj else None

        return rule

    def _apply_transform(self, transform_name: str, value: Any) -> Any:
        if value is None:
            return None

        if transform_name == 'sha256':
            if not isinstance(value, str):
                value = str(value)
            return hashlib.sha256(value.encode('utf-8')).hexdigest()

        elif transform_name == 'normalize':
            if isinstance(value, str):
                return value.strip().lower()
            return value

        elif transform_name == 'normalize_email':
            if isinstance(value, str):
                return value.strip().lower()
            return value

        elif transform_name == 'normalize_phone':
            # Remove symbols, keep numbers
            if isinstance(value, str):
                return ''.join(filter(str.isdigit, value))
            return value

        elif transform_name == 'to_epoch':
            if isinstance(value, (datetime, date)):
                if hasattr(value, 'timestamp'):
                    return int(value.timestamp())
                # For date objects
                return int(datetime.combine(value, datetime.min.time()).timestamp())
            try:
                # Try parsing ISO string?
                # Simple fallback: return as is if int/float
                return int(value)
            except Exception:
                return value

        elif transform_name == 'cast_int':
            try:
                return int(value)
            except Exception:
                return value

        elif transform_name == 'cast_float':
            try:
                return float(value)
            except Exception:
                return value

        elif transform_name == 'cast_string':
            return str(value)

        return value







def _partner_agent() -> str:
    try:
        return f"databricks-pyspark-udtf/{_pkg_version('pyspark-udtf')}"
    except PackageNotFoundError:
        return "databricks-pyspark-udtf/unknown"



_PARTNER_AGENT = _partner_agent()

class MetaCAPILogic:


    def __init__(self):
        self.batch_size = 1000
        self.buffer = []
        # API parameters are set on the first eval call or if they change
        self.current_pixel_id = None
        self.current_access_token = None
        self.current_mapping_yaml = None
        self.current_test_event_code = None

        self.mapping_engine = None
        # API Version
        self.api_version = "v20.0"

    def eval(self, row: Row, pixel_id: str, access_token: str, mapping_yaml: str, test_event_code: str | None = None):

        # If credentials or mapping change, flush the existing buffer.
        if self.buffer and (
            pixel_id != self.current_pixel_id or
            access_token != self.current_access_token or
            mapping_yaml != self.current_mapping_yaml or
            test_event_code != self.current_test_event_code
        ):
            yield from self._flush()

        # Initialize or update mapping engine if yaml changed
        if mapping_yaml != self.current_mapping_yaml:
            self.mapping_engine = MappingEngine(mapping_yaml)
            self.current_mapping_yaml = mapping_yaml

        self.current_pixel_id = pixel_id
        self.current_access_token = access_token
        self.current_test_event_code = test_event_code

        try:
            # Use MappingEngine to transform row
            event_data = self.mapping_engine.transform_row(row)

            if event_data:
                self.buffer.append(event_data)
        except Exception as e:
            # Yield failure for specific row mapping error
            yield "failed", 0, 1, None, f"Mapping error: {str(e)}"
            return

        if len(self.buffer) >= self.batch_size:
            yield from self._flush()

    def terminate(self):
        if self.buffer:
            yield from self._flush()

    def _flush(self):
        if not self.buffer:
            return

        current_batch_size = len(self.buffer)
        url = f"https://graph.facebook.com/{self.api_version}/{self.current_pixel_id}/events"

        params = {"access_token": self.current_access_token}

        payload = {
            "data": self.buffer,
            "partner_agent": _PARTNER_AGENT
        }

        if self.current_test_event_code:
            payload["test_event_code"] = self.current_test_event_code

        try:
            response = requests.post(url, params=params, json=payload)

            res_json = response.json()

            if response.status_code == 200:
                events_received = res_json.get("events_received", 0)
                fbtrace_id = res_json.get("fbtrace_id")
                # Calculate failed as batch_size - events_received (if meaningful), otherwise 0.
                events_failed = max(0, current_batch_size - events_received)
                yield "success", events_received, events_failed, fbtrace_id, None
            else:
                # API returned an error
                error_data = res_json.get("error", {})
                error_msg = error_data.get("message", json.dumps(error_data))
                error_user_title = error_data.get("error_user_title")
                error_user_msg = error_data.get("error_user_msg")
                error_subcode = error_data.get("error_subcode")
                fbtrace_id = res_json.get("fbtrace_id") or error_data.get("fbtrace_id")

                # Build detailed error message
                detailed_error_msg = f"[{response.status_code}] {error_msg}"
                if error_user_title:
                    detailed_error_msg += f": {error_user_title}"
                if error_user_msg:
                    detailed_error_msg += f" - {error_user_msg}"
                if error_subcode:
                    detailed_error_msg += f" | Subcode: {error_subcode}"

                yield "failed", 0, current_batch_size, fbtrace_id, detailed_error_msg

        except Exception as e:
            # Network or other exception
            yield "failed", 0, current_batch_size, None, str(e)

        # Clear buffer after processing
        self.buffer = []

globals().update(locals())
