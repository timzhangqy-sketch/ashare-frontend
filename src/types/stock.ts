export interface DimScore {
  key:   string;   // 'volRatio' | 'turnover' | 'return20d' | 'rs' | 'ma5Slope'
  name:  string;   // 'VR量比' | '换手率' | '20日收益' | 'RS强度' | 'MA5斜率'
  score: number;   // 0–100
  value: string;   // 实际值描述，e.g. "3.8x"
}

export interface HardGate {
  label:  string;
  pass:   boolean;
  detail: string;
}

export interface StockDetail {
  code:      string;
  name:      string;
  close:     number;
  changePct: number;
  lists:     string[];   // 出现的榜单名称
  dims:      DimScore[]; // 五维得分
  gates:     HardGate[]; // 硬门槛
}
