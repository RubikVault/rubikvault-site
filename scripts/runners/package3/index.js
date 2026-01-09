import { run as runEarningsPressure } from "./26-earnings-pressure-lite.js";
import { run as runInsiderActivity } from "./27-insider-activity-lite.js";
import { run as runOptionsSkew } from "./28-options-skew-lite.js";
import { run as runGammaExposure } from "./29-gamma-exposure-lite.js";
import { run as runFlowAnomaly } from "./30-flow-anomaly-lite.js";
import { run as runSentiment } from "./31-sentiment-lite.js";
import { run as runSocialVelocity } from "./32-social-velocity-lite.js";
import { run as runAnalystRevision } from "./33-analyst-revision-lite.js";
import { run as runMacroRiskScore } from "./34-macro-risk-score.js";
import { run as runTailRisk } from "./35-tail-risk-watch.js";
import { run as runLiquidityStress } from "./36-liquidity-stress-watch.js";
import { run as runRegimeFracture } from "./37-regime-fracture-alert.js";
import { run as runCatalystCalendar } from "./38-catalyst-calendar-lite.js";
import { run as runCrossAsset } from "./39-cross-asset-divergence.js";
import { run as runSystemicRisk } from "./40-systemic-risk-lite.js";
import { run as runWeeklyBrief } from "./41-weekly-market-brief.js";
import { run as runAlphaRadar } from "./42-alpha-radar-lite.js";
import { run as runMasterDashboard } from "./43-master-market-dashboard.js";

export const PACKAGE3_RUNNERS = {
  "earnings-pressure-lite": runEarningsPressure,
  "insider-activity-lite": runInsiderActivity,
  "options-skew-lite": runOptionsSkew,
  "gamma-exposure-lite": runGammaExposure,
  "flow-anomaly-lite": runFlowAnomaly,
  "sentiment-lite": runSentiment,
  "social-velocity-lite": runSocialVelocity,
  "analyst-revision-lite": runAnalystRevision,
  "macro-risk-score": runMacroRiskScore,
  "tail-risk-watch": runTailRisk,
  "liquidity-stress-watch": runLiquidityStress,
  "regime-fracture-alert": runRegimeFracture,
  "catalyst-calendar-lite": runCatalystCalendar,
  "cross-asset-divergence": runCrossAsset,
  "systemic-risk-lite": runSystemicRisk,
  "weekly-market-brief": runWeeklyBrief,
  "alpha-radar-lite": runAlphaRadar,
  "master-market-dashboard": runMasterDashboard
};
