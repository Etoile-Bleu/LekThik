mod mailer;
mod session;
mod user;
mod verification_code;

pub use mailer::{EmailMessage, Mailer, MailerError};
pub use session::{TokenError, TokenIssuer};
pub use user::{CreateUserError, NewUser, User, UserRepo, UserRepoError};
pub use verification_code::{VerificationCodeRepo, VerificationCodeRepoError, VerificationPurpose};

#[cfg(feature = "test-utils")]
pub use mailer::MockMailer;
#[cfg(feature = "test-utils")]
pub use user::MockUserRepo;
#[cfg(feature = "test-utils")]
pub use verification_code::MockVerificationCodeRepo;
