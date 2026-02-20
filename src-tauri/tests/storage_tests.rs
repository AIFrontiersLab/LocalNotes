//! Unit tests for storage helpers (pure functions only).

use local_private_notes_lib::storage::{sanitize_filename, validate_note_id};

#[test]
fn test_sanitize_filename_removes_path_separators() {
    assert_eq!(sanitize_filename("a/b"), "a_b");
    assert_eq!(sanitize_filename("a\\b"), "a_b");
    assert_eq!(sanitize_filename("a:b"), "a_b");
}

#[test]
fn test_sanitize_filename_removes_dangerous_chars() {
    assert_eq!(sanitize_filename("a*b?c"), "a_b_c");
    assert_eq!(sanitize_filename("a\"b<c>d|e"), "a_b_c_d_e");
}

#[test]
fn test_sanitize_filename_trims() {
    assert_eq!(sanitize_filename("  foo  "), "foo");
}

#[test]
fn test_sanitize_filename_empty_after_trim() {
    let s = sanitize_filename("  ...  ");
    assert!(s.len() <= 200);
}

#[test]
fn test_validate_note_id_empty() {
    assert!(validate_note_id("").is_err());
}

#[test]
fn test_validate_note_id_no_slash() {
    assert!(validate_note_id("valid-id").is_ok());
    assert!(validate_note_id("uuid-like-123").is_ok());
}

#[test]
fn test_validate_note_id_rejects_traversal() {
    assert!(validate_note_id("..").is_err());
    assert!(validate_note_id(".").is_err());
    assert!(validate_note_id("a/b").is_err());
    assert!(validate_note_id("a\\b").is_err());
}
