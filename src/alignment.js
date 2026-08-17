'use strict';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SEPARATION_LIMIT_DEG = 5;

const MODEL_SPECS = {
  rev4Standard: { displayName: 'Standard 4', defaultTiltDeg: 20 },
  rev5Standard: { displayName: 'Starlink V5', defaultTiltDeg: 13 },
  rev3Rectangular: { displayName: 'Actuated', defaultTiltDeg: 25 },
  rev2Circular: { displayName: 'Standard Circular', defaultTiltDeg: 25 },
  mini1: { displayName: 'Mini', defaultTiltDeg: 20 },
  mini2: { displayName: 'Mini 2', defaultTiltDeg: 20 },
  performanceGen1: { displayName: 'Performance (Gen 1)', defaultTiltDeg: 25 },
  performanceGen2: { displayName: 'Performance (Gen 2)', defaultTiltDeg: 0 },
  performanceGen3: { displayName: 'Performance (Gen 3)', defaultTiltDeg: 0 },
  aviation: { displayName: 'Aviation', defaultTiltDeg: 0 },
  unknown: { displayName: 'Unknown model', defaultTiltDeg: 20 },
};

function resolveDishModel(hardwareVersion, motorized) {
  const hardware = String(hardwareVersion || '').toLowerCase().replace(/^rev_/, '');
  if (!hardware) return 'unknown';
  if (hardware.includes('aviation')) return 'aviation';
  if (hardware.startsWith('hp')) return motorized ? 'performanceGen1' : 'performanceGen2';
  if (hardware.startsWith('rev3') || hardware.startsWith('dishy')) return 'rev3Rectangular';
  if (hardware.startsWith('rev1') || hardware.startsWith('rev2')) return 'rev2Circular';
  if (hardware.startsWith('rev4_hp')) return 'performanceGen3';
  if (hardware.startsWith('rev4')) return 'rev4Standard';
  if (hardware.startsWith('rev5')) return 'rev5Standard';
  if (hardware.startsWith('mini1')) return 'mini1';
  if (hardware.startsWith('mini2')) return 'mini2';
  return 'unknown';
}

function modelSpec(status) {
  const model = resolveDishModel(
    status && status.deviceInfo && status.deviceInfo.hardwareVersion,
    status && status.hasActuators === 'HAS_ACTUATORS_YES'
  );
  return { id: model, ...MODEL_SPECS[model] };
}

function angularSeparationDeg(azimuthA, elevationA, azimuthB, elevationB) {
  const cosSeparation =
    Math.sin(elevationA * DEG_TO_RAD) * Math.sin(elevationB * DEG_TO_RAD) +
    Math.cos(elevationA * DEG_TO_RAD) * Math.cos(elevationB * DEG_TO_RAD) *
      Math.cos((azimuthA - azimuthB) * DEG_TO_RAD);
  const separation = Math.acos(Math.min(1, Math.max(-1, cosSeparation))) * RAD_TO_DEG;
  return Number.isNaN(separation) ? 0 : separation;
}

function azimuthToleranceDeg(targetElevation, currentElevation) {
  const targetRad = targetElevation * DEG_TO_RAD;
  const currentRad = currentElevation * DEG_TO_RAD;
  const limitRad = SEPARATION_LIMIT_DEG * DEG_TO_RAD;
  const denominator = Math.cos(targetRad) * Math.cos(currentRad);
  const cosAzimuth =
    (Math.cos(limitRad) - Math.sin(currentRad) * Math.sin(targetRad)) / denominator;
  if (cosAzimuth < -1) return 180;
  const tolerance = Math.acos(Math.min(1, cosAzimuth)) * RAD_TO_DEG;
  return Number.isNaN(tolerance) ? 0 : tolerance;
}

function wrapDegrees(angleDeg) {
  const wrapped = ((angleDeg % 360) + 360) % 360;
  return wrapped < 180 ? wrapped : wrapped - 360;
}

function computeAlignment(status) {
  const source = status || {};
  const stats = source.alignmentStats || {};
  const spec = modelSpec(source);
  const maxTargetElevation = source.mobilityClass === 'MOBILE' || spec.defaultTiltDeg < 8 ? 90 : 75;
  const desiredElevationRaw = stats.desiredBoresightElevationDeg;
  const targetElevation = desiredElevationRaw !== undefined && desiredElevationRaw !== 0
    ? Math.min(70, desiredElevationRaw)
    : 70;
  const desiredAzimuth = Number(stats.desiredBoresightAzimuthDeg || 0);
  const currentAzimuth = Number(source.boresightAzimuthDeg || 0);
  const currentElevation = Number(source.boresightElevationDeg || 0);
  const separationAtTarget = angularSeparationDeg(
    desiredAzimuth, targetElevation, currentAzimuth, currentElevation
  );
  const separationAtBandTop = angularSeparationDeg(
    desiredAzimuth, maxTargetElevation, currentAzimuth, currentElevation
  );
  const azimuthDiff = wrapDegrees(desiredAzimuth - currentAzimuth);
  const isValid = ['FILTER_CONVERGED', 'FILTER_UNCONVERGED'].includes(
    stats.attitudeEstimationState
  );
  const bandUsable = targetElevation >= 50;
  const effectiveAzimuthError = Math.acos(Math.sqrt(
    Math.cos(azimuthDiff * DEG_TO_RAD) ** 2 * Math.cos(currentElevation * DEG_TO_RAD) ** 2 +
    Math.sin(currentElevation * DEG_TO_RAD) ** 2
  )) * RAD_TO_DEG;
  const isAligned =
    (isValid && separationAtTarget < SEPARATION_LIMIT_DEG) ||
    (isValid && bandUsable && separationAtBandTop < SEPARATION_LIMIT_DEG) ||
    (isValid && bandUsable && currentElevation > targetElevation &&
      currentElevation < maxTargetElevation && Math.abs(azimuthDiff) < 90 &&
      Math.abs(effectiveAzimuthError) < SEPARATION_LIMIT_DEG);
  const tolerance = Math.max(
    azimuthToleranceDeg(targetElevation, currentElevation),
    bandUsable ? azimuthToleranceDeg(maxTargetElevation, currentElevation) : 0,
    bandUsable && currentElevation > targetElevation && currentElevation < maxTargetElevation
      ? azimuthToleranceDeg(currentElevation, currentElevation)
      : 0
  );
  const upperLimit = Math.max(Math.min((bandUsable ? maxTargetElevation : targetElevation) + 5, 90), 0);
  const lowerLimit = Math.max(Math.min(targetElevation - 5, 90), 0);
  const desiredElevation = desiredElevationRaw === undefined ? currentElevation : desiredElevationRaw;

  return {
    model: spec,
    isValid,
    isAligned,
    boresightAzimuthDeg: currentAzimuth,
    boresightElevationDeg: currentElevation,
    desiredAzimuthDeg: desiredAzimuth,
    desiredElevationDeg: desiredElevation,
    azimuthToleranceDeg: tolerance,
    upperElevationLimitDeg: upperLimit,
    lowerElevationLimitDeg: lowerLimit,
    isElevationValid: currentElevation > lowerLimit && currentElevation < upperLimit,
    boresightErrorDeg: angularSeparationDeg(
      currentAzimuth, currentElevation, desiredAzimuth, desiredElevation
    ),
    elevationErrorDeg: currentElevation - desiredElevation,
    azimuthErrorDeg: wrapDegrees(currentAzimuth - desiredAzimuth),
    tiltAngleDeg: Number(stats.tiltAngleDeg || 0),
  };
}

module.exports = {
  DEG_TO_RAD,
  SEPARATION_LIMIT_DEG,
  angularSeparationDeg,
  azimuthToleranceDeg,
  computeAlignment,
  modelSpec,
  resolveDishModel,
  wrapDegrees,
};
