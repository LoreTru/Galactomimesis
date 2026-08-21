# Galactomimesis

Current version: 0.7

**A 3D view of where you are looking in the Milky Way.**

Galactomimesis is a lightweight, browser-based 3D visualizer for amateur astronomers. It represents the Milky Way, the Earth and a chosen deep-sky objects in a common galactic reference frame, making it possible to visualize the direction of observation from Earth and the position of an object within the Galaxy.

While a planetarium shows **where an object is in the sky**, Galactomimesis shows **where you are looking in the Galaxy**.

The application is entirely client-side and requires no installation or backend. It is built with HTML, CSS and JavaScript, using Three.js-for  3D rendering. Objects can be selected directly or passed through the URL query string, allowing specific views to be shared easily.

The Galactic structure is a simplified visual model based on astronomical literature. It is intended for spatial visualization and didactic use, not as a precise reconstruction of the Milky Way.

**Live application:** https://loretru.github.io/Galactomimesis/

Coordinate conversion utility page (helps to create a querystring for custom objects): https://loretru.github.io/Galactomimesis/coordconv.html

# Usage

1) Simply go to Galactomimesis and choose one or more objects from the list. Each object will have a random colour. Press "Apply" to set, or "Reset" to clear. Use the "hamburger" button to collapse the search-box. The info-panel is also collapsible pressing the "-" / "i" button.

2) Go directly to an object using the "id" parameter: https://loretru.github.io/Galactomimesis?id=m42. 
Look at the catalog.json file to find objects. 
Please note: this overrides 1).

3) Create your custom object using the https://loretru.github.io/Galactomimesis/coordconv.html page. A querystring with the following parameters will be created:
- "ra" = right ascension (decimal degrees)
- "dec" = declination (decimal degrees)
- "dist" = distance (ligth years)
- "name" = a custom name (no spaces, escaped string).
Please note: this overrides 1) and 2).
