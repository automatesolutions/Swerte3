export type AnalyticsFeatureKind = 'gaussian' | 'error_distance' | 'cooccurrence' | 'cross_draw';

export type RootStackParamList = {
  Home: undefined;
  LihimPremium: undefined;
  Predict: undefined;
  Auth: undefined;
  Paywall: undefined;
  PictureAnalysis: undefined;
  MathAlgo: undefined;
  Analytics: undefined;
  AnalyticsFeature: { kind: AnalyticsFeatureKind };
};
