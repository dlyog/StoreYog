# Section photo prompts (synthetic demo store)

These are seven AI-generated section photos for the fictitious Little India Grocery. Each prompt describes the layout given in the products' saved shelf locations, so the yellow arrows can be placed on the correct item. The existing `indian-grocery-shelf.webp` pantry shelf (rice, toor/chana dal, turmeric, cumin, tea) stays as it is.

**For every image:**
- landscape **3:2**, at least **1600 × 1067**
- PNG or WebP
- save as `server/demo-assets/sections/<file name>`

The same style rules apply to all seven, and are repeated in each prompt: realistic photograph, straight-on view, warm ordinary indoor light, no people, no brand logos, no readable text or labels, no arrows or overlays. These are AI-generated synthetic images and the app labels them that way.

---

### 1. `lentils-flour.png` (Aisle 2)

> Realistic wide photograph of a neighborhood Indian grocery aisle shelf unit, straight-on, three shelves. **Top shelf:** left, clear bags of pale flattened rice flakes (poha); center, clear bags of fine pale-yellow semolina (sooji); right, clear bags of pale yellow gram flour (besan). **Middle shelf:** left, empty space; center, a small gap; right, clear bags of small green split lentils (moong dal); far right, clear bags of small orange-red lentils (masoor dal). **Lower shelf:** left, clear bags of large cream-white chickpeas (kabuli chana); center, clear bags of dark red kidney beans (rajma); right, clear bags of small white split lentils (urad dal). **Bottom shelf, left:** large plain brown paper flour sacks (atta). Warm ordinary indoor light. No people, no brand logos, no readable text or labels, no arrows.

### 2. `spice-rack.png` (Aisle 3)

> Realistic photograph of a wall-mounted spice rack in a small Indian grocery, straight-on, four rows of identical unbranded clear pouches and small jars. **Top row:** left, deep brown garam masala pouches; right, small pale-green cardamom pod pouches. **Second row:** left, light brown coriander powder pouches; right, bright red chili powder pouches. **Third row:** small round dark mustard seeds in pouches across the row. **Bottom row:** mixed plain spice jars. Warm ordinary indoor light. No people, no brand logos, no readable text or labels, no arrows.

### 3. `oils-ghee.png` (Aisle 1)

> Realistic photograph of an oil and ghee shelf in a small Indian grocery, straight-on, three shelves. **Top shelf:** rows of glass jars of golden ghee. **Middle shelf:** left, amber bottles of mustard oil; right, clear bottles of white coconut oil. **Upper right shelf area:** stacked golden-brown jaggery blocks wrapped in clear film. Warm ordinary indoor light. No people, no brand logos, no readable text or labels, no arrows.

### 4. `dairy-fridge.png` (right wall)

> Realistic photograph of a glass-door dairy refrigerator in a small Indian grocery, doors open, straight-on, three shelves. **Top shelf:** stacked white blocks of fresh paneer in clear packs. **Middle shelf:** white plastic yogurt tubs (dahi). **Bottom shelf:** plain white one-gallon milk jugs. Bright refrigerator light. No people, no brand logos, no readable text or labels, no arrows.

### 5. `produce-bins.png` (by the entrance)

> Realistic photograph of fresh produce bins near the entrance of a small Indian grocery, straight-on. **Left:** a bin of red tomatoes. **Center:** loose brown onions. **Right:** small baskets of fresh ginger root and bright green chilies. **Floor crate in front:** brown potatoes. **A small chilled shelf at the top right:** bunches of fresh cilantro. Natural daylight from the doorway. No people, no brand logos, no readable text or labels, no arrows.

### 6. `freezer.png` (rear of the store)

> Realistic photograph looking down into an open chest freezer at the rear of a small Indian grocery, three wire baskets. **Top basket:** plain boxes of frozen samosas. **Middle basket:** flat plain packets of samosa pastry wrappers. **Bottom basket:** stacked plain packets of frozen parathas. Light frost, cool white light. No people, no brand logos, no readable text or labels, no arrows.

### 7. `snacks-pickles.png` (Aisle 4)

> Realistic photograph of a snacks and pickles shelf in a small Indian grocery, straight-on, two shelves. **Top shelf:** stacks of round thin papad in clear packs. **Lower shelf:** glass jars of orange-red mango pickle. Warm ordinary indoor light. No people, no brand logos, no readable text or labels, no arrows.

---

When the files are in `server/demo-assets/sections/`, the loader attaches each photo to its products, publishes it as an AI-generated synthetic image, and places one arrow per product from the coordinates in `server/demo-sections.ts`. Those coordinates are set by looking at each finished image.
