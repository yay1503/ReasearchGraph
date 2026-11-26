export const NODE_TYPE_STYLES = {
  paper: {
    accent: '#2563EB',
    badgeBg: '#EFF6FF',
    badgeBorder: '#BFDBFE',
    badgeText: '#1D4ED8',
  },
  question: {
    accent: '#7C3AED',
    badgeBg: '#F5F3FF',
    badgeBorder: '#DDD6FE',
    badgeText: '#6D28D9',
  },
  dataset: {
    accent: '#0891B2',
    badgeBg: '#ECFEFF',
    badgeBorder: '#A5F3FC',
    badgeText: '#0E7490',
  },
  experiment: {
    accent: '#D97706',
    badgeBg: '#FFFBEB',
    badgeBorder: '#FDE68A',
    badgeText: '#B45309',
  },
  error_fix: {
    accent: '#E11D48',
    badgeBg: '#FFF1F2',
    badgeBorder: '#FECDD3',
    badgeText: '#BE123C',
  },
  result: {
    accent: '#059669',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#047857',
  },
  note: {
    accent: '#57534E',
    badgeBg: '#F5F5F4',
    badgeBorder: '#E7E5E4',
    badgeText: '#44403C',
  },
  what_if: {
    accent: '#D97706',
    badgeBg: '#FFFBEB',
    badgeBorder: '#FDE68A',
    badgeText: '#B45309',
  },
};

export function getNodeTypeStyle(type) {
  return NODE_TYPE_STYLES[type] || NODE_TYPE_STYLES.note;
}

export function getNodeColor(type) {
  return getNodeTypeStyle(type).accent;
}
