export interface ChemicalProfile {
  label: string;
  note: string;
}

/**
 * 受控的娱乐化人格模板。只消费已计算的分数与雷点数，
 * 不参与识别、风险判断、评分或后端持久化。
 */
export function selectChemicalProfile(
  score: number,
  totalMines: number,
): ChemicalProfile {
  if (totalMines > 0) {
    return {
      label: '家庭炼金术预备役',
      note: score < 50
        ? '清洁效果想叠 Buff，化学反应也准备直接开大。'
        : '清洁效果想叠 Buff，化学反应也准备叠 Buff。',
    };
  }
  return {
    label: '本轮没翻车型',
    note: '这次没命中规则，不代表以后可以把标签当装饰。',
  };
}
