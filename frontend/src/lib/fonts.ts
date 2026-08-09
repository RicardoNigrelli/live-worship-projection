// Google Fonts loaded on-demand when selected in style panels.
// Epilogue + Inter are always loaded from globals.css.

const loadedFonts = new Set<string>();

const fontFamilyMap: Record<string, string> = {
  Montserrat: 'Montserrat:wght@400;600;700;900',
  Roboto: 'Roboto:wght@400;500;700',
  'Open Sans': 'Open+Sans:wght@400;600;700',
  Poppins: 'Poppins:wght@400;600;700',
  Lato: 'Lato:wght@400;700',
  Raleway: 'Raleway:wght@400;600;700',
  Oswald: 'Oswald:wght@400;600;700',
  'Playfair Display': 'Playfair+Display:wght@400;700',
};

export function loadFont(family: string) {
  if (!family || loadedFonts.has(family)) return;
  const spec = fontFamilyMap[family];
  if (!spec) return;

  loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}
