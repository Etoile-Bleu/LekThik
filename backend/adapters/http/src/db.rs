use sqlx::postgres::{PgPool, PgPoolOptions};

pub async fn connect() -> anyhow::Result<PgPool> {
    let database_url =
        std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is not set"))?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;

    Ok(pool)
}
