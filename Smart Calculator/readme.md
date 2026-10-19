# Luxe Calc

A calculator and unit converter for the browser, with a standard and a scientific mode, calculation history and five colour themes.

**Live Demo:** https://sudoati.github.io/luxe-calc/

---

## Features

- **Standard and Scientific** modes (sin, cos, tan with a DEG / RAD switch, brackets, powers and more)
- **Calculation history** that you can show, hide or clear; tap a past result to reuse it
- **Twelve unit converters:** currency, volume, length, weight, temperature, energy, area, speed, time, power, data and pressure
- **Five themes:** Midnight, Sage, Golden, Orange and Baby Pink
- **Settings** for the theme and the display font size; your choices are saved in `localStorage`
- **Keyboard support** and a built-in shortcuts window
- **Responsive layout** with a sidebar on desktop and a compact layout on mobile

> Currency conversion uses fixed, approximate rates. It does not fetch live exchange rates.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| 0-9 and . | Type numbers |
| + - * / | Add, subtract, multiply, divide |
| Enter or = | Calculate |
| Backspace | Delete the last entry |
| Esc or Delete | Clear everything |
| % | Percent |
| ( ) ^ p | Brackets, power and pi (scientific mode) |

## Technologies

- HTML5
- CSS3 (Grid, Flexbox, custom properties)
- Vanilla JavaScript (ES6+)

No frameworks, libraries or build tools are needed.

## Project structure

```text
luxe-calc/
├── index.html
├── style.css
├── script.js
└── README.md
```

## Getting started

1. Clone the repository:

   ```bash
   git clone https://github.com/sudoati/luxe-calc.git
   ```

2. Open the folder and double-click `index.html`, or run it with the VS Code **Live Server** extension.

## Author

**Attiqa**

- GitHub: https://github.com/sudoati