import defaults from './defaults';

const config = {
    port: process.env.PORT || defaults.port,
    // sql
    sqlHost: process.env.SQL_HOST || defaults.sqlHost,
    sqlPort: process.env.SQL_PORT || defaults.sqlPort,
    sqlUser: process.env.SQL_USER || defaults.sqlUser,
    sqlPassword: process.env.SQL_PASSWORD || defaults.sqlPassword,
    sqlDatabase: process.env.SQL_DATABASE || defaults.sqlDatabase,
}

export default config;
