use domain::VerificationPurpose;
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub(crate) const CODE_TTL_SECONDS: i64 = 600;
pub(crate) const MAX_ATTEMPTS: i32 = 5;

const CODE_SPACE: u32 = 1_000_000;
const LARGEST_UNBIASED_VALUE: u32 = u32::MAX - (u32::MAX % CODE_SPACE);

pub(crate) fn generate_code() -> String {
    loop {
        let bytes = Uuid::new_v4().into_bytes();
        let value = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);

        if value < LARGEST_UNBIASED_VALUE {
            return format!("{:06}", value % CODE_SPACE);
        }
    }
}

pub(crate) fn hash_code(user_id: Uuid, purpose: VerificationPurpose, code: &str) -> String {
    let purpose_label = match purpose {
        VerificationPurpose::EmailVerification => "email_verification",
        VerificationPurpose::PasswordReset => "password_reset",
    };
    let digest = Sha256::digest(format!("{purpose_label}:{user_id}:{code}").as_bytes());

    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(crate) fn is_well_formed(code: &str) -> bool {
    code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_six_digit_codes() {
        for _ in 0..200 {
            assert!(is_well_formed(&generate_code()));
        }
    }

    #[test]
    fn hash_is_stable_and_scoped_to_user_and_purpose() {
        let user_id = Uuid::new_v4();

        let first = hash_code(user_id, VerificationPurpose::EmailVerification, "123456");
        let second = hash_code(user_id, VerificationPurpose::EmailVerification, "123456");
        let other_purpose = hash_code(user_id, VerificationPurpose::PasswordReset, "123456");
        let other_user = hash_code(
            Uuid::new_v4(),
            VerificationPurpose::EmailVerification,
            "123456",
        );

        assert_eq!(first.len(), 64);
        assert_eq!(first, second);
        assert_ne!(first, other_purpose);
        assert_ne!(first, other_user);
    }

    #[test]
    fn rejects_malformed_codes() {
        assert!(!is_well_formed("12345"));
        assert!(!is_well_formed("1234567"));
        assert!(!is_well_formed("12a456"));
        assert!(!is_well_formed(""));
    }
}
