import type { UserMe } from '../services/api';

export type AnalyticsFeatureKind = 'gaussian' | 'error_distance' | 'cooccurrence' | 'cross_draw';

export type RootStackParamList = {
  Home: undefined;
  ProfileSetup: {
    from?: 'onboarding' | 'home' | 'complete_profile';
    /** From welcome flow: same payload as GET /me so Profile can render without waiting again. */
    prefetchedMe?: UserMe;
  };
  LihimPremium: undefined;
  Predict: undefined;
  VideoHome: undefined;
  Paywall: undefined;
  PictureAnalysis: undefined;
  MathAlgo: undefined;
  Analytics: undefined;
  AnalyticsFeature: { kind: AnalyticsFeatureKind };
};
