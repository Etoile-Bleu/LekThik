mod account;
pub mod boards;
mod mailer;
mod preferences;
mod session;
mod user;
mod verification_code;

pub use account::{
    AccountError, AccountExport, AccountRepo, ExportAssignment, ExportComment, ExportMembership,
    ExportProfile, ExportVote, OwnedWorkspace,
};
pub use mailer::{EmailMessage, Mailer, MailerError};
pub use preferences::{
    BoardPreferences, CardDisplay, ColorVision, Density, LetterSpacing, MAX_BOARD_PREFERENCES,
    Motion, Preferences, PreferencesError, PreferencesRepo, ReadingFont, TextSize, Theme,
};
pub use session::{TokenError, TokenIssuer};
pub use user::{CreateUserError, NewUser, User, UserRepo, UserRepoError};
pub use verification_code::{VerificationCodeRepo, VerificationCodeRepoError, VerificationPurpose};

#[cfg(feature = "test-utils")]
pub use account::MockAccountRepo;
#[cfg(feature = "test-utils")]
pub use mailer::MockMailer;
#[cfg(feature = "test-utils")]
pub use preferences::MockPreferencesRepo;
#[cfg(feature = "test-utils")]
pub use user::MockUserRepo;
#[cfg(feature = "test-utils")]
pub use verification_code::MockVerificationCodeRepo;
