import {
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  evaluateFuturesPaperRisk,
  isFuturesTestScenario,
  type FuturesLeverage,
  type FuturesPaperHistoryRecord,
  type FuturesPaperPosition,
  type FuturesPaperSettings,
  type FuturesPaperTradeInput,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import {
  normalizePaperRiskSettings,
  type PaperRiskSettings,
} from "@/lib/paperRiskController";
import {
  generateFuturesStrategySetup,
  type FuturesStrategyConfidence,
  type FuturesStrategyProfile,
} from "@/lib/futuresStrategyProfiles";

export type ForwardTestProfile = Exclude<FuturesStrategyProfile, "Manual">;
export type ForwardTestDirection = "LONG" | "SHORT" | "WAIT";
export type ForwardTestRiskStatus = "APPROVED" | "BLOCKED" | "WAIT" | "REDUCED";
export type ForwardTestSessionStatus = "ACTIVE" | "COMPLETED";

export interface ForwardTestSessionConfig {
  profile: ForwardTestProfile;
  scenario: FuturesTestScenario;
  symbol: FuturesSymbol;
  leverage: FuturesLeverage;
  notes: string;
}

export interface ForwardTestObservation {
  id: string;
  timestamp: string;
  sessionId: string;
  symbol: FuturesSymbol;
  profile: ForwardTestProfile;
  scenario: FuturesTestScenario;
  direction: ForwardTestDirection;
  confidence: FuturesStrategyConfidence;
  entryReference: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  leverage: FuturesLeverage;
  riskStatus: ForwardTestRiskStatus;
  riskReason: string;
  setupReason: string;
  invalidationNote: string;
  userNote: string;
  noOrderDisclaimer: typeof FORWARD_TEST_NO_ORDER_DISCLAIMER;
}

export interface ForwardTestSession {
  id: string;
  status: ForwardTestSessionStatus;
  startedAt: string;
  stoppedAt?: string;
  config: ForwardTestSessionConfig;
  observations: ForwardTestObservation[];
}

export interface ForwardTestData {
  activeSession: ForwardTestSession | null;
  completedSessions: ForwardTestSession[];
}

export interface ForwardTestSummary {
  totalObservations: number;
  actionableSignals: number;
  waitCount: number;
  riskBlockedCount: number;
  approvedCount: number;
  reducedCount: number;
  longCount: number;
  shortCount: number;
  averageConfidence: number;
  latestObservationTime: string | null;
  sessionDurationSeconds: number;
  mostCommonBlockReason: string | null;
}

export interface ForwardTestObservationContext {
  timestamp: string;
  userNote: string;
  paperPortfolioValue: number;
  openPositions: FuturesPaperPosition[];
  futuresHistory: FuturesPaperHistoryRecord[];
  futuresSettings: FuturesPaperSettings;
  riskSettings: PaperRiskSettings;
}

type ForwardTestDataResult =
  | { ok: true; data: ForwardTestData; session: ForwardTestSession }
  | { ok: false; message: string };

type ForwardTestObservationResult =
  | { ok: true; data: ForwardTestData; observation: ForwardTestObservation }
  | { ok: false; message: string };

type CreatedForwardTestObservationResult =
  | { ok: true; observation: ForwardTestObservation }
  | { ok: false; message: string };

export const FORWARD_TEST_STORAGE_KEY = "chanter-forward-test-data";
export const MAX_FORWARD_TEST_OBSERVATIONS = 200;
export const MAX_FORWARD_TEST_COMPLETED_SESSIONS = 20;
export const FORWARD_TEST_NO_ORDER_DISCLAIMER =
  "Observation only. No real or paper order was created." as const;
export const FORWARD_TEST_PROFILES: ForwardTestProfile[] = [
  "Trend Follow",
  "Breakout",
  "Mean Reversion",
];
export const DEFAULT_FORWARD_TEST_CONFIG: ForwardTestSessionConfig = {
  profile: "Trend Follow",
  scenario: "Neutral / Current Mock",
  symbol: "BTCUSDT",
  leverage: 2,
  notes: "",
};
export const EMPTY_FORWARD_TEST_DATA: ForwardTestData = {
  activeSession: null,
  completedSessions: [],
};

const PROFILE_SET = new Set<ForwardTestProfile>(FORWARD_TEST_PROFILES);
const RISK_STATUS_SET = new Set<ForwardTestRiskStatus>([
  "APPROVED",
  "BLOCKED",
  "WAIT",
  "REDUCED",
]);
const CONFIDENCE_SET = new Set<FuturesStrategyConfidence>(["Low", "Medium", "High"]);
const DIRECTION_SET = new Set<ForwardTestDirection>(["LONG", "SHORT", "WAIT"]);
const MAX_SESSION_NOTES_LENGTH = 2_000;
const MAX_OBSERVATION_NOTE_LENGTH = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSupportedProfile(value: unknown): value is ForwardTestProfile {
  return typeof value === "string" && PROFILE_SET.has(value as ForwardTestProfile);
}

function isSupportedSymbol(value: unknown): value is FuturesSymbol {
  return typeof value === "string" && SUPPORTED_FUTURES_SYMBOLS.includes(value as FuturesSymbol);
}

function isSupportedLeverage(value: unknown): value is FuturesLeverage {
  return typeof value === "number" &&
    SUPPORTED_FUTURES_LEVERAGE.includes(value as FuturesLeverage);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeConfig(value: unknown): ForwardTestSessionConfig | null {
  if (!isRecord(value)) return null;
  if (
    !isSupportedProfile(value.profile) ||
    !isFuturesTestScenario(value.scenario) ||
    !isSupportedSymbol(value.symbol) ||
    !isSupportedLeverage(value.leverage) ||
    typeof value.notes !== "string" ||
    value.notes.length > MAX_SESSION_NOTES_LENGTH
  ) {
    return null;
  }
  return {
    profile: value.profile,
    scenario: value.scenario,
    symbol: value.symbol,
    leverage: value.leverage,
    notes: value.notes,
  };
}

function normalizeObservation(
  value: unknown,
  sessionId: string,
  config: ForwardTestSessionConfig,
): ForwardTestObservation | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" || value.id.trim() === "" ||
    !isValidDate(value.timestamp) ||
    value.sessionId !== sessionId ||
    value.symbol !== config.symbol ||
    value.profile !== config.profile ||
    value.scenario !== config.scenario ||
    typeof value.direction !== "string" || !DIRECTION_SET.has(value.direction as ForwardTestDirection) ||
    typeof value.confidence !== "string" || !CONFIDENCE_SET.has(value.confidence as FuturesStrategyConfidence) ||
    !isFiniteNumber(value.entryReference) || value.entryReference <= 0 ||
    !isFiniteNumber(value.stopLossPercent) || value.stopLossPercent <= 0 || value.stopLossPercent >= 100 ||
    !isFiniteNumber(value.takeProfitPercent) || value.takeProfitPercent <= 0 ||
    value.leverage !== config.leverage ||
    typeof value.riskStatus !== "string" || !RISK_STATUS_SET.has(value.riskStatus as ForwardTestRiskStatus) ||
    typeof value.riskReason !== "string" || value.riskReason.trim() === "" ||
    typeof value.setupReason !== "string" || value.setupReason.trim() === "" ||
    typeof value.invalidationNote !== "string" || value.invalidationNote.trim() === "" ||
    typeof value.userNote !== "string" || value.userNote.length > MAX_OBSERVATION_NOTE_LENGTH ||
    value.noOrderDisclaimer !== FORWARD_TEST_NO_ORDER_DISCLAIMER
  ) {
    return null;
  }

  const direction = value.direction as ForwardTestDirection;
  const riskStatus = value.riskStatus as ForwardTestRiskStatus;
  if (direction === "WAIT" && riskStatus !== "WAIT") return null;

  return {
    id: value.id,
    timestamp: value.timestamp,
    sessionId,
    symbol: config.symbol,
    profile: config.profile,
    scenario: config.scenario,
    direction,
    confidence: value.confidence as FuturesStrategyConfidence,
    entryReference: value.entryReference,
    stopLossPercent: value.stopLossPercent,
    takeProfitPercent: value.takeProfitPercent,
    leverage: config.leverage,
    riskStatus,
    riskReason: value.riskReason,
    setupReason: value.setupReason,
    invalidationNote: value.invalidationNote,
    userNote: value.userNote,
    noOrderDisclaimer: FORWARD_TEST_NO_ORDER_DISCLAIMER,
  };
}

function normalizeSession(value: unknown): ForwardTestSession | null {
  if (!isRecord(value)) return null;
  const config = normalizeConfig(value.config);
  if (
    !config ||
    typeof value.id !== "string" || value.id.trim() === "" ||
    (value.status !== "ACTIVE" && value.status !== "COMPLETED") ||
    !isValidDate(value.startedAt) ||
    !Array.isArray(value.observations)
  ) {
    return null;
  }
  const startedAt = value.startedAt as string;

  const stoppedAt = value.stoppedAt;
  if (
    (value.status === "ACTIVE" && stoppedAt !== undefined) ||
    (value.status === "COMPLETED" && !isValidDate(stoppedAt)) ||
    (typeof stoppedAt === "string" && Date.parse(stoppedAt) < Date.parse(startedAt))
  ) {
    return null;
  }

  const observations = value.observations.map((observation) =>
    normalizeObservation(observation, value.id as string, config),
  );
  if (observations.some((observation) => observation === null)) return null;
  const normalizedObservations = observations
    .filter((observation): observation is ForwardTestObservation => observation !== null)
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  if (new Set(normalizedObservations.map((observation) => observation.id)).size !== normalizedObservations.length) {
    return null;
  }
  if (normalizedObservations.some((observation) =>
    Date.parse(observation.timestamp) < Date.parse(startedAt) ||
    (typeof stoppedAt === "string" && Date.parse(observation.timestamp) > Date.parse(stoppedAt)))) {
    return null;
  }

  return {
    id: value.id,
    status: value.status,
    startedAt,
    ...(typeof stoppedAt === "string" ? { stoppedAt } : {}),
    config,
    observations: normalizedObservations,
  };
}

function capForwardTestData(data: ForwardTestData): ForwardTestData {
  let remainingObservations = MAX_FORWARD_TEST_OBSERVATIONS;
  const activeSession = data.activeSession
    ? {
        ...data.activeSession,
        config: { ...data.activeSession.config },
        observations: data.activeSession.observations.slice(0, remainingObservations),
      }
    : null;
  remainingObservations -= activeSession?.observations.length ?? 0;

  const completedSessions = data.completedSessions
    .slice(0, MAX_FORWARD_TEST_COMPLETED_SESSIONS)
    .map((session) => {
      const observations = session.observations.slice(0, Math.max(0, remainingObservations));
      remainingObservations -= observations.length;
      return {
        ...session,
        config: { ...session.config },
        observations,
      };
    });

  return { activeSession, completedSessions };
}

export function normalizeForwardTestData(value: unknown): ForwardTestData | null {
  if (!isRecord(value)) return null;
  const activeSession = value.activeSession === null
    ? null
    : normalizeSession(value.activeSession);
  if (value.activeSession !== null && !activeSession) return null;
  if (activeSession && activeSession.status !== "ACTIVE") return null;
  if (!Array.isArray(value.completedSessions)) return null;

  const completedSessions = value.completedSessions.map(normalizeSession);
  if (completedSessions.some((session) => session === null)) return null;
  const normalizedCompleted = completedSessions
    .filter((session): session is ForwardTestSession => session !== null)
    .sort((left, right) =>
      Date.parse(right.stoppedAt ?? right.startedAt) - Date.parse(left.stoppedAt ?? left.startedAt));
  if (normalizedCompleted.some((session) => session.status !== "COMPLETED")) return null;

  const allSessionIds = [
    ...(activeSession ? [activeSession.id] : []),
    ...normalizedCompleted.map((session) => session.id),
  ];
  if (new Set(allSessionIds).size !== allSessionIds.length) return null;

  return capForwardTestData({
    activeSession,
    completedSessions: normalizedCompleted,
  });
}

export function startForwardTestSession(
  data: ForwardTestData,
  configInput: ForwardTestSessionConfig,
  startedAt: string,
): ForwardTestDataResult {
  const normalizedData = normalizeForwardTestData(data);
  if (!normalizedData) return { ok: false, message: "Forward test session data is invalid." };
  if (normalizedData.activeSession) {
    return { ok: false, message: "Stop the active forward test session before starting another." };
  }
  const config = normalizeConfig(configInput);
  if (!config) return { ok: false, message: "Select valid forward test session settings." };
  if (!isValidDate(startedAt)) return { ok: false, message: "Session start time is invalid." };

  const session: ForwardTestSession = {
    id: `forward-session-${hashText(`${startedAt}|${JSON.stringify(config)}`)}`,
    status: "ACTIVE",
    startedAt,
    config,
    observations: [],
  };
  return {
    ok: true,
    session,
    data: capForwardTestData({
      activeSession: session,
      completedSessions: normalizedData.completedSessions,
    }),
  };
}

export function stopForwardTestSession(
  data: ForwardTestData,
  stoppedAt: string,
): ForwardTestDataResult {
  const normalizedData = normalizeForwardTestData(data);
  if (!normalizedData) return { ok: false, message: "Forward test session data is invalid." };
  const activeSession = normalizedData.activeSession;
  if (!activeSession) return { ok: false, message: "No active forward test session is available." };
  if (!isValidDate(stoppedAt) || Date.parse(stoppedAt) < Date.parse(activeSession.startedAt)) {
    return { ok: false, message: "Session stop time is invalid." };
  }

  const session: ForwardTestSession = {
    ...activeSession,
    status: "COMPLETED",
    stoppedAt,
    config: { ...activeSession.config },
    observations: activeSession.observations.map((observation) => ({ ...observation })),
  };
  return {
    ok: true,
    session,
    data: capForwardTestData({
      activeSession: null,
      completedSessions: [
        session,
        ...normalizedData.completedSessions.filter((item) => item.id !== session.id),
      ],
    }),
  };
}

function createObservation(
  session: ForwardTestSession,
  context: ForwardTestObservationContext,
): CreatedForwardTestObservationResult {
  if (session.status !== "ACTIVE") {
    return { ok: false, message: "Observations can only be added to an active session." };
  }
  if (!isValidDate(context.timestamp) || Date.parse(context.timestamp) < Date.parse(session.startedAt)) {
    return { ok: false, message: "Observation time is invalid." };
  }
  if (typeof context.userNote !== "string" || context.userNote.length > MAX_OBSERVATION_NOTE_LENGTH) {
    return { ok: false, message: "Observation note must be 1,000 characters or fewer." };
  }
  if (!isFiniteNumber(context.paperPortfolioValue) || context.paperPortfolioValue < 0) {
    return { ok: false, message: "Paper portfolio value is invalid." };
  }
  const riskSettings = normalizePaperRiskSettings(context.riskSettings);
  if (!riskSettings) return { ok: false, message: "Risk Controller settings are invalid." };

  const setup = generateFuturesStrategySetup(
    session.config.profile,
    session.config.symbol,
    session.config.scenario,
  );
  let riskStatus: ForwardTestRiskStatus = "WAIT";
  let riskReason = "Strategy profile returned WAIT. No trade candidate was evaluated.";

  if (setup.suggestedDirection !== "WAIT") {
    const sizingCapital = context.paperPortfolioValue > 0
      ? context.paperPortfolioValue
      : riskSettings.defaultPaperCapital;
    const maxNotional = sizingCapital * riskSettings.maxTradeSizePercent / 100;
    const marginAmount = maxNotional / session.config.leverage;
    const trade: FuturesPaperTradeInput = {
      symbol: session.config.symbol,
      scenario: session.config.scenario,
      direction: setup.suggestedDirection,
      entryPrice: setup.entryReference,
      marginAmount,
      leverage: session.config.leverage,
      stopLossPercent: setup.stopLossPercent,
      takeProfitPercent: setup.takeProfitPercent,
      strategyReason: setup.strategyReason,
    };
    const preview = evaluateFuturesPaperRisk({
      trade,
      markPrice: setup.entryReference,
      openPositions: context.openPositions,
      history: context.futuresHistory,
      futuresSettings: context.futuresSettings,
      riskSettings,
      paperPortfolioValue: context.paperPortfolioValue,
      now: context.timestamp,
    });
    riskStatus = preview.decision;
    riskReason = preview.reason;
  }

  const observation: ForwardTestObservation = {
    id: `${session.id}-observation-${hashText(`${context.timestamp}|${session.observations.length}|${context.userNote}`)}`,
    timestamp: context.timestamp,
    sessionId: session.id,
    symbol: session.config.symbol,
    profile: session.config.profile,
    scenario: session.config.scenario,
    direction: setup.suggestedDirection,
    confidence: setup.confidence,
    entryReference: setup.entryReference,
    stopLossPercent: setup.stopLossPercent,
    takeProfitPercent: setup.takeProfitPercent,
    leverage: session.config.leverage,
    riskStatus,
    riskReason,
    setupReason: setup.strategyReason,
    invalidationNote: setup.invalidationNote,
    userNote: context.userNote.trim(),
    noOrderDisclaimer: FORWARD_TEST_NO_ORDER_DISCLAIMER,
  };
  return {
    ok: true,
    observation,
  };
}

export function addForwardTestObservation(
  data: ForwardTestData,
  context: ForwardTestObservationContext,
): ForwardTestObservationResult {
  const normalizedData = normalizeForwardTestData(data);
  if (!normalizedData) return { ok: false, message: "Forward test session data is invalid." };
  const activeSession = normalizedData.activeSession;
  if (!activeSession) return { ok: false, message: "Start a forward test session first." };

  const result = createObservation(activeSession, context);
  if (result.ok === false) return result;
  const nextSession: ForwardTestSession = {
    ...activeSession,
    config: { ...activeSession.config },
    observations: [
      result.observation,
      ...activeSession.observations.filter((item) => item.id !== result.observation.id),
    ],
  };
  return {
    ok: true,
    observation: result.observation,
    data: capForwardTestData({
      activeSession: nextSession,
      completedSessions: normalizedData.completedSessions,
    }),
  };
}

export function getForwardTestSummary(session: ForwardTestSession | null): ForwardTestSummary {
  if (!session) {
    return {
      totalObservations: 0,
      actionableSignals: 0,
      waitCount: 0,
      riskBlockedCount: 0,
      approvedCount: 0,
      reducedCount: 0,
      longCount: 0,
      shortCount: 0,
      averageConfidence: 0,
      latestObservationTime: null,
      sessionDurationSeconds: 0,
      mostCommonBlockReason: null,
    };
  }

  const observations = session.observations;
  const confidenceScore: Record<FuturesStrategyConfidence, number> = {
    Low: 1,
    Medium: 2,
    High: 3,
  };
  const blockedReasons = new Map<string, number>();
  for (const observation of observations) {
    if (observation.riskStatus === "BLOCKED") {
      blockedReasons.set(
        observation.riskReason,
        (blockedReasons.get(observation.riskReason) ?? 0) + 1,
      );
    }
  }
  const mostCommonBlockReason = [...blockedReasons.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const latestObservationTime = observations.reduce<string | null>((latest, observation) =>
    !latest || Date.parse(observation.timestamp) > Date.parse(latest)
      ? observation.timestamp
      : latest, null);
  const durationEnd = session.stoppedAt ?? latestObservationTime ?? session.startedAt;

  return {
    totalObservations: observations.length,
    actionableSignals: observations.filter((item) => item.direction !== "WAIT").length,
    waitCount: observations.filter((item) => item.direction === "WAIT").length,
    riskBlockedCount: observations.filter((item) => item.riskStatus === "BLOCKED").length,
    approvedCount: observations.filter((item) => item.riskStatus === "APPROVED").length,
    reducedCount: observations.filter((item) => item.riskStatus === "REDUCED").length,
    longCount: observations.filter((item) => item.direction === "LONG").length,
    shortCount: observations.filter((item) => item.direction === "SHORT").length,
    averageConfidence: observations.length > 0
      ? Number((observations.reduce(
          (sum, observation) => sum + confidenceScore[observation.confidence],
          0,
        ) / observations.length).toFixed(2))
      : 0,
    latestObservationTime,
    sessionDurationSeconds: Math.max(
      0,
      Math.floor((Date.parse(durationEnd) - Date.parse(session.startedAt)) / 1_000),
    ),
    mostCommonBlockReason,
  };
}

export function getLatestForwardTestObservation(
  data: ForwardTestData,
): ForwardTestObservation | null {
  const sessions = [
    ...(data.activeSession ? [data.activeSession] : []),
    ...data.completedSessions,
  ];
  return sessions
    .flatMap((session) => session.observations)
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0] ?? null;
}

export function loadForwardTestData(): ForwardTestData {
  try {
    const parsed = JSON.parse(localStorage.getItem(FORWARD_TEST_STORAGE_KEY) ?? "null");
    return normalizeForwardTestData(parsed) ?? {
      activeSession: null,
      completedSessions: [],
    };
  } catch {
    return { activeSession: null, completedSessions: [] };
  }
}

export function saveForwardTestData(data: ForwardTestData): boolean {
  const normalized = normalizeForwardTestData(data);
  if (!normalized) return false;
  try {
    localStorage.setItem(FORWARD_TEST_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function clearForwardTestData(): boolean {
  try {
    localStorage.removeItem(FORWARD_TEST_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
