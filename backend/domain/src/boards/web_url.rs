use super::error::BoardsError;

pub const WEB_URL_MAX_CHARS: usize = 2_048;

/// The parts of an `http` or `https` address that the rest of the code needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parts<'a> {
    pub scheme: &'a str,
    pub host: &'a str,
    /// Starts with `/`, or is empty.
    pub path: &'a str,
    /// Without the `?`.
    pub query: &'a str,
}

fn invalid() -> BoardsError {
    BoardsError::Invalid("enter a web address that starts with https://".to_string())
}

fn host_is_plain(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && !host.starts_with('.')
        && !host.ends_with('.')
        && !host.contains("..")
        && host
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
}

/// Splits a web address, refusing anything that is not a plain one: other schemes, spaces or
/// control characters, credentials in the address, an IP literal in brackets, or an odd host.
pub fn split(url: &str) -> Result<Parts<'_>, BoardsError> {
    if url.is_empty() || url.chars().count() > WEB_URL_MAX_CHARS {
        return Err(invalid());
    }
    if url
        .chars()
        .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(invalid());
    }

    let (scheme, rest) = if let Some(rest) = strip_prefix_ignore_case(url, "https://") {
        ("https", rest)
    } else if let Some(rest) = strip_prefix_ignore_case(url, "http://") {
        ("http", rest)
    } else {
        return Err(invalid());
    };

    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let after = &rest[authority_end..];

    // `user@host` is how addresses are made to look like another site.
    if authority.contains('@') {
        return Err(invalid());
    }
    let host = match authority.rsplit_once(':') {
        Some((host, port)) if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) => {
            if port.len() > 5 {
                return Err(invalid());
            }
            host
        }
        Some(_) => return Err(invalid()),
        None => authority,
    };
    if !host_is_plain(host) {
        return Err(invalid());
    }

    let before_fragment = after.split('#').next().unwrap_or("");
    let (path, query) = match before_fragment.split_once('?') {
        Some((path, query)) => (path, query),
        None => (before_fragment, ""),
    };

    Ok(Parts {
        scheme,
        host,
        path,
        query,
    })
}

fn strip_prefix_ignore_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    if value.len() >= prefix.len() && value[..prefix.len()].eq_ignore_ascii_case(prefix) {
        Some(&value[prefix.len()..])
    } else {
        None
    }
}

/// The value of a query parameter, as written (not decoded).
pub fn query_value<'a>(query: &'a str, name: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == name).then_some(value)
    })
}

/// A link a person typed, kept only when it is a plain `http` or `https` address.
/// Returns it with the scheme and host in lower case.
pub fn parse_link(url: &str) -> Result<String, BoardsError> {
    let parts = split(url.trim())?;
    let start = parts.scheme.len() + 3;
    let host_end = start
        + url.trim()[start..]
            .find(['/', '?', '#'])
            .unwrap_or(url.trim()[start..].len());
    let trimmed = url.trim();
    let authority = &trimmed[start..host_end];
    let host_lower = authority.to_ascii_lowercase();
    Ok(format!(
        "{}://{}{}",
        parts.scheme,
        host_lower,
        &trimmed[host_end..]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_a_plain_address() {
        let parts = split("https://www.example.com/a/b?x=1&y=2#top").expect("split");

        assert_eq!(parts.scheme, "https");
        assert_eq!(parts.host, "www.example.com");
        assert_eq!(parts.path, "/a/b");
        assert_eq!(parts.query, "x=1&y=2");
    }

    #[test]
    fn accepts_a_port_and_no_path() {
        let parts = split("http://example.com:8080").expect("split");

        assert_eq!(
            (parts.host, parts.path, parts.query),
            ("example.com", "", "")
        );
    }

    #[test]
    fn refuses_everything_that_is_not_a_plain_web_address() {
        for bad in [
            "",
            "example.com",
            "ftp://example.com",
            "javascript:alert(1)",
            "data:text/html,hi",
            "//example.com",
            "https://",
            "https:///path",
            "https://user:pass@example.com",
            "https://example.com@evil.example",
            "https://exa mple.com",
            "https://example.com/\n",
            "https://[::1]/",
            "https://example..com",
            "https://.example.com",
            "https://example.com:abc",
            "https://example.com:123456",
            "https://exa_mple.com",
        ] {
            assert!(split(bad).is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn refuses_addresses_that_are_too_long() {
        let long = format!("https://example.com/{}", "a".repeat(WEB_URL_MAX_CHARS));

        assert!(split(&long).is_err());
    }

    #[test]
    fn reads_query_values_as_written() {
        assert_eq!(query_value("v=abc&t=3", "v"), Some("abc"));
        assert_eq!(query_value("v=abc&t=3", "t"), Some("3"));
        assert_eq!(query_value("v=abc", "x"), None);
        assert_eq!(query_value("", "v"), None);
    }

    #[test]
    fn a_link_keeps_its_path_and_lowercases_the_host() {
        assert_eq!(
            parse_link("  HTTPS://Example.COM/Path?Q=1  ").as_deref(),
            Ok("https://example.com/Path?Q=1")
        );
        assert!(parse_link("mailto:a@b.c").is_err());
    }
}
