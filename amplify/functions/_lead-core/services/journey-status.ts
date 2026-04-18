import type { JourneyStatus } from '../domain/journey.ts';

function scoreJourneyStatus(status: JourneyStatus): number {
  switch (status) {
    case 'archived':
      return 4;
    case 'qualified':
      return 3;
    case 'verified':
      return 2;
    case 'captured':
      return 1;
    case 'active':
    case 'incomplete':
      return -1;
  }
}

export function mergeJourneyStatus(current: JourneyStatus, incoming: JourneyStatus): JourneyStatus {
  const currentScore = scoreJourneyStatus(current);
  const incomingScore = scoreJourneyStatus(incoming);

  if (currentScore >= 0 || incomingScore >= 0) {
    return incomingScore > currentScore ? incoming : current;
  }

  return incoming;
}

export function applyJourneyStatusTransition(args: {
  currentStatus: JourneyStatus | null;
  currentReason: string | null;
  incomingStatus: JourneyStatus | null;
  incomingReason: string | null;
}): {
  journeyStatus: JourneyStatus | null;
  statusReason: string | null;
} {
  if (!args.currentStatus) {
    return {
      journeyStatus: args.incomingStatus,
      statusReason: args.incomingStatus ? args.incomingReason : args.currentReason,
    };
  }

  if (!args.incomingStatus) {
    return {
      journeyStatus: args.currentStatus,
      statusReason: args.currentReason,
    };
  }

  const journeyStatus = mergeJourneyStatus(args.currentStatus, args.incomingStatus);
  return {
    journeyStatus,
    statusReason: journeyStatus === args.currentStatus ? args.currentReason : args.incomingReason,
  };
}
