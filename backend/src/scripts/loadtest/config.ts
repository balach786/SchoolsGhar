import dotenv from 'dotenv';
dotenv.config();

export interface ConcurrencyStageConfig {
  stage: number;
  vus: number;
  durationMs: number;
}

export const LOAD_TEST_CONFIG = {
  // Safety constraints
  LOAD_TEST_ENABLED: process.env.LOAD_TEST === 'true',
  TARGET_DB_NAME: 'school-management-system-loadtest',
  PROTECTED_DATABASES: ['school-management-system', 'production', 'live', 'admin'],
  APPROVED_HOSTS: ['localhost', '127.0.0.1'],
  
  // Concurrency & duration limits
  MAX_VUS: 50,
  MAX_STAGE_DURATION_MS: 120_000,
  ERROR_THRESHOLD_PERCENT: 2.0,

  // Staged concurrency levels
  STAGES: [
    { stage: 1, vus: 5, durationMs: 15_000 },
    { stage: 2, vus: 10, durationMs: 20_000 },
    { stage: 3, vus: 25, durationMs: 25_000 },
    { stage: 4, vus: 50, durationMs: 30_000 },
  ] as ConcurrencyStageConfig[],

  // Dataset profiles
  DATASETS: {
    A_MICRO: {
      schools: 5,
      studentsPerSchool: 100,
      staffPerSchool: 10,
      classesPerSchool: 4,
      sectionsPerClass: 2,
    },
    B_SMALL: {
      schools: 5,
      studentsPerSchool: 300,
      staffPerSchool: 20,
      classesPerSchool: 10,
      sectionsPerClass: 2,
    },
  },
};
