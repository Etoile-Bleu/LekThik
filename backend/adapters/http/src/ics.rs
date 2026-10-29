//! Turns a person's assigned cards into an RFC 5545 calendar feed: plain text, no library, since
//! the shape needed here is one line of fields and one flat list of all-day events, never a
//! recurrence rule. `build_feed` and `dtstamp_now` are what other modules call.

use std::time::{SystemTime, UNIX_EPOCH};

use domain::boards::AssignedCard;

const LINE_LIMIT: usize = 75;

/// Folds a line to RFC 5545's 75 octet limit: every continuation starts with a space, which a
/// reader must strip back out. Splits are kept on ASCII boundaries, which this feed only ever
/// writes in the first place (`escape_text` passes names and titles through as UTF-8, but the
/// fold itself only ever has to reason about the escaped punctuation it inserts).
fn fold_line(line: &str) -> String {
    let bytes = line.as_bytes();
    if bytes.len() <= LINE_LIMIT {
        return format!("{line}\r\n");
    }

    let mut folded = String::new();
    let mut start = 0;
    let mut first = true;
    while start < bytes.len() {
        let budget = if first { LINE_LIMIT } else { LINE_LIMIT - 1 };
        let mut end = (start + budget).min(bytes.len());
        while end > start && !line.is_char_boundary(end) {
            end -= 1;
        }
        if !first {
            folded.push(' ');
        }
        folded.push_str(&line[start..end]);
        folded.push_str("\r\n");
        start = end;
        first = false;
    }
    folded
}

/// Escapes the four characters RFC 5545 TEXT values reserve, in the order that keeps a literal
/// backslash in the input from being read as the start of one of the others.
fn escape_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

fn is_leap(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

fn days_in(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap(year) => 29,
        _ => 28,
    }
}

/// The calendar day after a `YYYY-MM-DD` due date, as `YYYYMMDD`: the exclusive end most
/// calendar clients expect from a one day, all-day event written with `VALUE=DATE`.
fn next_day_basic(due_date: &str) -> Option<String> {
    let year: u32 = due_date.get(0..4)?.parse().ok()?;
    let month: u32 = due_date.get(5..7)?.parse().ok()?;
    let day: u32 = due_date.get(8..10)?.parse().ok()?;

    let (year, month, day) = if day < days_in(year, month) {
        (year, month, day + 1)
    } else if month < 12 {
        (year, month + 1, 1)
    } else {
        (year + 1, 1, 1)
    };

    Some(format!("{year:04}{month:02}{day:02}"))
}

fn due_date_basic(due_date: &str) -> Option<String> {
    (due_date.len() == 10).then(|| due_date.replace('-', ""))
}

fn event(card: &AssignedCard, stamp: &str, card_url: &str) -> Option<String> {
    let due_date = card.due_date.as_deref()?;
    let start = due_date_basic(due_date)?;
    let end = next_day_basic(due_date)?;

    let description = format!(
        "{} / {} \u{2014} {}",
        card.workspace_name, card.board_name, card.list_name
    );

    let mut lines = vec![
        "BEGIN:VEVENT".to_string(),
        format!("UID:{}@lekthik", card.id),
        format!("DTSTAMP:{stamp}"),
        format!("DTSTART;VALUE=DATE:{start}"),
        format!("DTEND;VALUE=DATE:{end}"),
        format!("SUMMARY:{}", escape_text(&card.title)),
        format!("DESCRIPTION:{}", escape_text(&description)),
        format!("URL:{card_url}"),
        "END:VEVENT".to_string(),
    ];
    lines.retain(|line| !line.is_empty());
    Some(lines.into_iter().map(|line| fold_line(&line)).collect())
}

/// `stamp` is `DTSTAMP`'s value, `YYYYMMDDTHHMMSSZ`, computed once by the caller so every event
/// in one response carries the same generation time, as RFC 5545 expects. `app_base_url` links
/// each event back to its card; cards without a due date are left out, since an all-day event
/// needs a day to sit on.
pub fn build_feed(
    username: &str,
    cards: &[AssignedCard],
    stamp: &str,
    app_base_url: &str,
) -> String {
    let base = app_base_url.trim_end_matches('/');
    let mut body = String::new();
    body.push_str(&fold_line("BEGIN:VCALENDAR"));
    body.push_str(&fold_line("VERSION:2.0"));
    body.push_str(&fold_line("PRODID:-//LekThik//Calendar Feed//EN"));
    body.push_str(&fold_line("CALSCALE:GREGORIAN"));
    body.push_str(&fold_line("METHOD:PUBLISH"));
    body.push_str(&fold_line(&format!(
        "X-WR-CALNAME:{}",
        escape_text(&format!("{username}\u{2019}s LekThik cards"))
    )));
    // Hints how often a client may re-poll; clients that ignore it just poll on their own schedule.
    body.push_str(&fold_line("X-PUBLISHED-TTL:PT6H"));

    for card in cards {
        let card_url = format!("{base}/b/{}?card={}", card.board_id, card.id);
        if let Some(block) = event(card, stamp, &card_url) {
            body.push_str(&block);
        }
    }

    body.push_str(&fold_line("END:VCALENDAR"));
    body
}

/// The civil (Gregorian) date for a day count since 1970-01-01, days east of the epoch positive.
/// Howard Hinnant's `civil_from_days`, public domain: <https://howardhinnant.github.io/date_algorithms.html>.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `DTSTAMP`'s value for right now, `YYYYMMDDTHHMMSSZ`. A clock reading from before 1970 (a
/// misconfigured machine, never a real one) falls back to the epoch itself rather than panic.
pub fn dtstamp_now() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = elapsed.as_secs();
    let (year, month, day) = civil_from_days((secs / 86_400) as i64);
    let remainder = secs % 86_400;
    format!(
        "{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z",
        remainder / 3600,
        (remainder % 3600) / 60,
        remainder % 60
    )
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    fn card(title: &str, due_date: Option<&str>) -> AssignedCard {
        AssignedCard {
            id: Uuid::nil(),
            title: title.to_string(),
            due_date: due_date.map(str::to_string),
            list_id: Uuid::nil(),
            list_name: "Doing".to_string(),
            board_id: Uuid::nil(),
            board_name: "Launch".to_string(),
            workspace_id: Uuid::nil(),
            workspace_name: "Studio".to_string(),
        }
    }

    #[test]
    fn wraps_every_line_in_crlf_and_the_calendar_bounds() {
        let feed = build_feed("wen", &[], "20261029T000000Z", "https://app.example");

        assert!(feed.starts_with("BEGIN:VCALENDAR\r\n"));
        assert!(feed.ends_with("END:VCALENDAR\r\n"));
        assert!(feed.contains("VERSION:2.0\r\n"));
        // Every line break is a CRLF pair, never a bare LF.
        assert!(
            feed.match_indices('\n')
                .all(|(at, _)| feed.as_bytes()[at - 1] == b'\r')
        );
    }

    #[test]
    fn leaves_out_a_card_with_no_due_date() {
        let feed = build_feed(
            "wen",
            &[card("No date", None)],
            "20261029T000000Z",
            "https://app.example",
        );

        assert!(!feed.contains("BEGIN:VEVENT"));
    }

    #[test]
    fn writes_an_all_day_event_with_an_exclusive_end() {
        let feed = build_feed(
            "wen",
            &[card("Ship it", Some("2026-10-31"))],
            "20261029T000000Z",
            "https://app.example",
        );

        assert!(feed.contains("DTSTART;VALUE=DATE:20261031\r\n"));
        assert!(feed.contains("DTEND;VALUE=DATE:20261101\r\n"));
        assert!(feed.contains("SUMMARY:Ship it\r\n"));
    }

    #[test]
    fn rolls_the_end_date_over_a_leap_day_and_a_year() {
        assert_eq!(next_day_basic("2024-02-28"), Some("20240229".to_string()));
        assert_eq!(next_day_basic("2026-02-28"), Some("20260301".to_string()));
        assert_eq!(next_day_basic("2026-12-31"), Some("20270101".to_string()));
    }

    #[test]
    fn escapes_commas_semicolons_backslashes_and_newlines() {
        assert_eq!(escape_text("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
    }

    #[test]
    fn folds_a_long_line_with_a_leading_space_on_each_continuation() {
        let long = "SUMMARY:".to_string() + &"x".repeat(200);
        let folded = fold_line(&long);

        for line in folded.split("\r\n").filter(|line| !line.is_empty()) {
            assert!(line.len() <= LINE_LIMIT);
        }
        assert!(
            folded
                .lines()
                .nth(1)
                .is_some_and(|line| line.starts_with(' '))
        );
        assert_eq!(folded.replace("\r\n ", "").replace("\r\n", ""), long);
    }

    #[test]
    fn turns_a_day_count_into_the_right_calendar_date() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(-1), (1969, 12, 31));
        assert_eq!(civil_from_days(19_662), (2023, 11, 1));
    }

    #[test]
    fn stamps_now_as_a_well_formed_utc_timestamp() {
        let stamp = dtstamp_now();

        assert_eq!(stamp.len(), 16);
        assert_eq!(&stamp[8..9], "T");
        assert_eq!(&stamp[15..16], "Z");
        assert!(stamp[0..8].chars().all(|c| c.is_ascii_digit()));
        assert!(stamp[9..15].chars().all(|c| c.is_ascii_digit()));
        assert!(stamp.starts_with("20"));
    }

    #[test]
    fn links_each_event_back_to_its_card() {
        let one = card("Ship it", Some("2026-10-31"));
        let feed = build_feed(
            "wen",
            std::slice::from_ref(&one),
            "20261029T000000Z",
            "https://app.example/",
        );

        // A long URL line is folded, so undo that before looking for it whole.
        let unfolded = feed.replace("\r\n ", "");
        assert!(unfolded.contains(&format!(
            "URL:https://app.example/b/{}?card={}\r\n",
            one.board_id, one.id
        )));
    }
}
