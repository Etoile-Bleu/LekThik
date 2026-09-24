use domain::{TokenError, TokenIssuer};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const SESSION_TTL_SECONDS: u64 = 3600;

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: Uuid,
    exp: u64,
}

pub struct JwtTokenIssuer {
    secret: SecretString,
}

impl JwtTokenIssuer {
    pub fn new(secret: SecretString) -> Self {
        Self { secret }
    }
}

impl TokenIssuer for JwtTokenIssuer {
    fn issue(&self, user_id: Uuid) -> Result<String, TokenError> {
        let claims = Claims {
            sub: user_id,
            exp: jsonwebtoken::get_current_timestamp() + SESSION_TTL_SECONDS,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.secret.expose_secret().as_bytes()),
        )
        .map_err(|error| TokenError::Issue(error.to_string()))
    }

    fn verify(&self, token: &str) -> Result<Uuid, TokenError> {
        decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.secret.expose_secret().as_bytes()),
            &Validation::default(),
        )
        .map(|data| data.claims.sub)
        .map_err(|_| TokenError::Invalid)
    }
}

#[cfg(test)]
mod tests {
    use jsonwebtoken::{DecodingKey, Validation, decode};
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    struct DecodedClaims {
        sub: Uuid,
        exp: u64,
    }

    #[test]
    fn issues_a_token_carrying_the_user_id() {
        let issuer = JwtTokenIssuer::new(SecretString::from("test-secret".to_string()));
        let user_id = Uuid::new_v4();

        let token = issuer.issue(user_id).expect("issuing should succeed");

        let decoded = decode::<DecodedClaims>(
            &token,
            &DecodingKey::from_secret(b"test-secret"),
            &Validation::default(),
        )
        .expect("token should decode");

        assert_eq!(decoded.claims.sub, user_id);
        assert!(decoded.claims.exp > jsonwebtoken::get_current_timestamp());
    }

    #[test]
    fn verifies_a_token_it_issued() {
        let issuer = JwtTokenIssuer::new(SecretString::from("test-secret".to_string()));
        let user_id = Uuid::new_v4();

        let token = issuer.issue(user_id).expect("issuing should succeed");
        let verified = issuer.verify(&token).expect("verify should succeed");

        assert_eq!(verified, user_id);
    }

    #[test]
    fn rejects_a_token_signed_with_a_different_secret() {
        let issuer_a = JwtTokenIssuer::new(SecretString::from("secret-a".to_string()));
        let issuer_b = JwtTokenIssuer::new(SecretString::from("secret-b".to_string()));

        let token = issuer_a
            .issue(Uuid::new_v4())
            .expect("issuing should succeed");

        assert!(issuer_b.verify(&token).is_err());
    }
}
