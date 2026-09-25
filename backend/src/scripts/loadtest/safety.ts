import mongoose from 'mongoose';
import { LOAD_TEST_CONFIG } from './config';

export class LoadTestSafety {
  static assertSafeEnvironment(): void {
    if (process.env.LOAD_TEST !== 'true') {
      throw new Error(
        'FATAL: LOAD_TEST environment variable must be explicitly set to "true" to run load tests.'
      );
    }
  }

  static assertSafeDatabase(connection: mongoose.Connection): void {
    const dbName = connection.db?.databaseName;
    if (!dbName) {
      throw new Error('FATAL: Database connection has no active database name.');
    }

    if (LOAD_TEST_CONFIG.PROTECTED_DATABASES.includes(dbName.toLowerCase())) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Refusing to run load test against protected database: "${dbName}". Target must be "${LOAD_TEST_CONFIG.TARGET_DB_NAME}".`
      );
    }

    if (dbName !== LOAD_TEST_CONFIG.TARGET_DB_NAME) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Target database "${dbName}" does not match approved load-test database "${LOAD_TEST_CONFIG.TARGET_DB_NAME}".`
      );
    }
  }

  static getLoadTestMongoUri(): string {
    const baseUri = process.env.MONGODB_URI;
    if (!baseUri) {
      throw new Error('MONGODB_URI is not defined in environment.');
    }

    // Replace database name in URI with school-management-system-loadtest
    const url = new URL(baseUri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Construct new URI pointing to school-management-system-loadtest
    let loadTestUri: string;
    if (baseUri.includes('?')) {
      const [beforeQuery, query] = baseUri.split('?');
      const prefix = beforeQuery.substring(0, beforeQuery.lastIndexOf('/'));
      loadTestUri = `${prefix}/${LOAD_TEST_CONFIG.TARGET_DB_NAME}?${query}`;
    } else {
      const prefix = baseUri.substring(0, baseUri.lastIndexOf('/'));
      loadTestUri = `${prefix}/${LOAD_TEST_CONFIG.TARGET_DB_NAME}`;
    }

    return loadTestUri;
  }
}
