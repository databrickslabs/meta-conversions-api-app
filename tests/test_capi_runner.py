"""Tests for capi_runner validation functions."""

import pytest
from server.capi_runner import (
    _validate_table_name,
    _sql_escape_string,
    load_mapping_yaml,
)


class TestValidateTableName:
    """Table name validation — prevents SQL injection via source_table."""

    def test_valid_three_part_name(self):
        assert _validate_table_name("catalog.schema.table") == "catalog.schema.table"

    def test_valid_with_underscores(self):
        assert _validate_table_name("my_catalog.my_schema.my_table") == "my_catalog.my_schema.my_table"

    def test_valid_with_numbers(self):
        assert _validate_table_name("cat1.schema2.table3") == "cat1.schema2.table3"

    def test_valid_backtick_quoted(self):
        assert _validate_table_name("`my catalog`.`my schema`.`my table`") == "`my catalog`.`my schema`.`my table`"

    def test_valid_mixed_quoted(self):
        assert _validate_table_name("`my catalog`.schema.table") == "`my catalog`.schema.table"

    def test_strips_whitespace(self):
        assert _validate_table_name("  catalog.schema.table  ") == "catalog.schema.table"

    def test_rejects_two_parts(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("catalog.schema")

    def test_rejects_one_part(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("just_a_name")

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("")

    def test_rejects_sql_injection_semicolon(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("catalog.schema.table; DROP TABLE x")

    def test_rejects_sql_injection_comment(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("catalog.schema.table -- comment")

    def test_rejects_sql_injection_subquery(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("(SELECT 1).schema.table")

    def test_rejects_sql_injection_union(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("catalog.schema.table UNION SELECT")

    def test_rejects_four_parts(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("a.b.c.d")

    def test_rejects_spaces_in_unquoted(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("my catalog.schema.table")

    def test_rejects_leading_number(self):
        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("1catalog.schema.table")


class TestSqlEscapeString:
    """SQL string escaping — single quotes must be doubled."""

    def test_no_quotes(self):
        assert _sql_escape_string("hello") == "hello"

    def test_single_quote(self):
        assert _sql_escape_string("it's") == "it''s"

    def test_multiple_quotes(self):
        assert _sql_escape_string("it's a 'test'") == "it''s a ''test''"

    def test_empty_string(self):
        assert _sql_escape_string("") == ""

    def test_backslashes_preserved(self):
        assert _sql_escape_string("path\\to\\file") == "path\\to\\file"

    def test_yaml_with_quotes(self):
        yaml = "key: 'value'\nother: 'data'"
        assert _sql_escape_string(yaml) == "key: ''value''\nother: ''data''"


class TestLoadMappingYaml:
    """Mapping YAML should be valid and not contain source_table."""

    def test_loads_without_error(self):
        yaml_str = load_mapping_yaml()
        assert isinstance(yaml_str, str)
        assert len(yaml_str) > 0

    def test_no_source_table_key(self):
        yaml_str = load_mapping_yaml()
        assert "source_table" not in yaml_str

    def test_contains_required_fields(self):
        yaml_str = load_mapping_yaml()
        assert "event_name" in yaml_str
        assert "event_time" in yaml_str
        assert "action_source" in yaml_str
        assert "user_data" in yaml_str

    def test_contains_user_data_fields(self):
        yaml_str = load_mapping_yaml()
        assert "em:" in yaml_str
        assert "ph:" in yaml_str
        assert "sha256" in yaml_str

    def test_contains_custom_data_fields(self):
        yaml_str = load_mapping_yaml()
        assert "custom_data" in yaml_str
        assert "value:" in yaml_str
        assert "currency:" in yaml_str
