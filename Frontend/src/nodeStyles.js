export const NODE_TYPE_STYLES = {
  paper: {
    accent: '#2563EB',
  },
  question: {
    accent: '#7C3AED',
  },
  dataset: {
    accent: '#0891B2',
  },
  experiment: {
    accent: '#D97706',
  },
  error_fix: {
    accent: '#E11D48',
  },
  result: {
    accent: '#059669',
  },
  note: {
    accent: '#57534E',
    darkAccent: '#A1A1AA',
  },
  what_if: {
    accent: '#D97706',
  },
  code: {
    accent: '#6366F1',
  },
  group: {
    accent: '#0EA5E9',
  },
};

export function getNodeTypeStyle(type) {
  return NODE_TYPE_STYLES[type] || NODE_TYPE_STYLES.note;
}

export function getNodeColor(type, theme = 'light') {
  const style = getNodeTypeStyle(type);
  if (theme === 'dark' && style.darkAccent) {
    return style.darkAccent;
  }
  return style.accent;
}
