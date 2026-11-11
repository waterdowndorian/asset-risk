(() => {
  'use strict';

  const defaultWeights = Object.freeze([45, 30, 25]);
  const criteria = Object.freeze({ priority: 70, observe: 40, poorHealth: 40 });
  const factors = ['상태 취약도', '운전 부담', '고장 영향'];
  const prefixes = ['TR', 'SW', 'LN'];
  const types = ['배전변압기', '개폐기', '전선'];
  const offices = ['익산지사', '군산지사', '전주지사', '정읍지사'];

  const demoAssets = Array.from({ length: 36 }, (_, index) => ({
    id: prefixes[index % 3] + '-' + String(1021 + index).padStart(5, '0'),
    type: types[index % 3],
    office: offices[index % offices.length],
    age: 3 + index % 28,
    condition: 15 + (index * 23) % 84,
    operation: 12 + (index * 31) % 88,
    consequence: 20 + (index * 17) % 80,
  }));

  function totalWeight(weights) {
    return weights.reduce((sum, weight) => sum + weight, 0);
  }

  function evaluate(assets, weights) {
    const total = totalWeight(weights);

    return assets.map(asset => {
      const hi = 100 - asset.condition;
      const weighted = asset.condition * weights[0] + asset.operation * weights[1]
        + asset.consequence * weights[2];
      const risk = weighted / total;
      const priority = risk >= criteria.priority;
      const lowHealth = hi < criteria.poorHealth;
      const grade = priority ? '우선 검토' : risk >= criteria.observe ? '관찰' : '일반';

      let action = '정기 점검';
      if (priority && lowHealth) {
        action = '상태진단·교체 타당성 검토';
      } else if (priority || lowHealth) {
        action = '우선 점검 검토';
      }

      return { ...asset, hi, risk, priority, grade, action };
    }).sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))
      .map((asset, index) => ({ ...asset, rank: index + 1 }));
  }

  window.RiskEvaluation = { defaultWeights, demoAssets, factors, criteria, totalWeight, evaluate };
})();
