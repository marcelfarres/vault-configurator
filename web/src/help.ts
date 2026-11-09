export type HelpBlock = {
  title: string;
  body: string;
  images?: string[];
  options?: Array<{ name: string; text: string }>;
};

export const HELP: Record<string, HelpBlock> = {
  depth: {
    title: "Depth",
    body: "Every module is 42 mm per grid unit deep plus 30 mm: 3 = 156 mm … 7 = 324 mm. All layers of a stack share the depth so they stack.",
    images: ["sizes.jpg"],
  },
  type: {
    title: "Drawers or sustainers",
    body: "Drawers are a module body with pull-out boxes. Sustainers are a box with a hinged lid.",
    images: ["two-types.jpg"],
    options: [
      { name: "Drawers", text: "A module body, boxes, and facades with a lock knob." },
      { name: "Sustainers", text: "A hinged box: flat, with dividers, or sealed." },
    ],
  },
  width: {
    title: "Width family",
    body: "S 165 mm, M 254 mm, L 330 mm, XL 419 mm. L = two S side by side, XL = S + M. The bottom layer sets the family.",
    images: ["stacking.jpg"],
  },
  height: {
    title: "Height",
    body: "1U = 51.5 mm, 2U = 99.5 mm, 4U = 195.5 mm. XL-width modules exist only in 1U.",
    images: ["sizes.jpg"],
  },
  interior: {
    title: "Drawer interior",
    body: "What goes inside each box.",
    images: ["interiors.jpg"],
    options: [
      { name: "empty", text: "Nothing extra." },
      { name: "Gridfinity baseplate", text: "A grid in the bottom of the box. S/M can add lifting handles." },
      { name: "grid dividers", text: "Snap-together walls. Set how many across and deep." },
    ],
  },
  key: {
    title: "Lock",
    body: "The lock sits in the facade. Turning it grips the box so the drawer cannot be pulled out.",
    images: ["key-lock.jpg"],
    options: [
      { name: "key", text: "The standard knob. Two printed parts: Key + Key Cap." },
      { name: "hidden key", text: "Flush with the facade. Turn it with a coin." },
      { name: "none", text: "No lock. The facade keeps its hole." },
    ],
  },
  rails: {
    title: "Geared rails",
    body: "Toothed strips in the box sides. The lock's teeth engage them. Required when a module has more than one box in 2U or 4U.",
    images: ["geared-rails.jpg"],
  },
  labels: {
    title: "Labels",
    body: "A slide-in label plate per facade. Write the text in the slicer before printing.",
    images: ["labels.jpg"],
  },
  facades: {
    title: "Facade split",
    body: "How the front is divided: one full-height box or several smaller boxes, listed top to bottom. Facade STLs print with supports on.",
    images: ["facade-files.jpg", "facade-assembly.jpg"],
  },
  manualSupports: {
    title: "Manual supports",
    body: "A sacrificial brace for this depth, placed against a tall module on the plate and snapped off after printing. Not the slicer's own supports.",
    images: ["manual-supports.jpg"],
  },
  variant: {
    title: "Sustainer interior",
    body: "L and XL sustainer bodies come in three versions.",
    images: ["interiors.jpg"],
    options: [
      { name: "flat", text: "Open box." },
      { name: "dividers", text: "Slots for movable width and depth dividers." },
      { name: "sealed", text: "Fixed, liquid-tight compartments." },
    ],
  },
  baseplate: { title: "Gridfinity baseplate", body: "A Gridfinity baseplate in the bottom of the box.", images: ["interiors.jpg"] },
  dividers: { title: "Dividers", body: "Flat divider walls for S/M sustainers.", images: ["sustainer-parts.jpg"] },
  roof: {
    title: "Roof",
    body: "The top plate of the stack, in the base family and depth.",
    images: ["roofs.jpg"],
    options: [
      { name: "Grid", text: "A Gridfinity grid on top, with an optional carry handle." },
      { name: "Flat", text: "A flat top." },
      { name: "Bowl", text: "A shallow tray." },
      { name: "Under-table", text: "Screws under a table; the stack slides on from below." },
      { name: "Heavyweight", text: "Thick roof with two bins and a handle. L and XL only." },
    ],
  },
  topHandle: { title: "Top handle", body: "Carry handle bolted through the grid roof (2 × M6 50 mm).", images: ["roofs.jpg"] },
  mods: { title: "Modifications", body: "Parts that turn the stack into a cart or a wall unit.", images: ["mods-overview.jpg"] },
  base: { title: "Base", body: "A thick slab under the lowest module. Holds the M16 axle and has M8 holes for casters.", images: ["wheels-feet.jpg"] },
  wheels: { title: "Wheels", body: "Two Ø160 wheels: disc, cover, bushing, TPU tyre, bearing, and a shaft collar.", images: ["wheels.jpg"] },
  feet: { title: "Feet", body: "A rear foot so the cart stands level on its two wheels.", images: ["wheels-feet.jpg"] },
  casters: { title: "Casters", body: "Four M8 casters in the base. Hardware only, nothing to print.", images: ["casters.jpg"] },
  backbone: {
    title: "Backbone",
    body: "Boards bolted to the back of the modules. They carry the handle, pegboards, and wall mounts.",
    images: ["backbone.jpg"],
    options: [
      { name: "none", text: "Modules just stack." },
      { name: "wide", text: "One board per layer, as wide as the module." },
      { name: "universal", text: "Two narrow boards per layer, leaving the middle free." },
    ],
  },
  pullout: { title: "Pull-out handle", body: "Telescopic trolley handle on two M16 rods in the backbone.", images: ["pullout-handle.jpg"] },
  stationary: { title: "Stationary handle", body: "Fixed grab handle bolted through the backbone.", images: ["stationary-handle.jpg"] },
  connectors: { title: "Module connectors", body: "Clips that join neighbouring modules through the backbone holes.", images: ["connectors.jpg"] },
  pegboard: {
    title: "Pegboard",
    body: "Attachment rails on the backbone. The panel itself is bought or printed separately.",
    images: ["pegboard.jpg"],
    options: [
      { name: "USSA", text: "Attachment for the designer's pegboard." },
      { name: "IKEA Skadis", text: "Attachment for an IKEA Skådis board." },
    ],
  },
  wallmount: { title: "Wall mounts", body: "A mounting plate per layer plus wall brackets.", images: ["wall-mount.jpg"] },
  noTall: { title: "No tall parts", body: "Tick for a bed-slinger. Parts taller than the limit go to another printer." },
  maxH: { title: "Max part height", body: "Tallest part this printer may print. Defaults to its Z height." },
  mode: { title: "Pack plates for", body: "Balance estimated print time over the printers ticked for this export, or pack everything for one of them." },
  addPrinter: { title: "Add printer", body: "Pick a printer to add a row. Dual-nozzle Bambus are listed once per nozzle, plus a combined both-nozzles row. The name you type is the label everywhere else." },
  stackFile: { title: "Stack file", body: "Save writes the stack and per-part colour choices to a JSON file. Load replaces the stack. Printers and filaments stay with this computer." },
  groupBy: { title: "Group plates by", body: "Colour packs fewest plates. Size keeps large parts on their own plates. Module keeps one module's parts of one colour together." },
  spacing: { title: "Part spacing", body: "Gap between parts on a plate, in millimetres." },
  edge: { title: "Bed-edge margin", body: "Keep-out margin at the bed edge, in millimetres." },
  machine: { title: "Machine preset", body: "The printer profile written into the 3MF. This can stay “Snapmaker U1” while the shop name shown in VAULT is “U1”." },
  defaultPreset: { title: "Default process preset", body: "The process preset the project opens with. Another preset on a part is written as a per-object override." },
  spoolman: { title: "Spoolman", body: "URL of a Spoolman server. Load spools fills a slot's name, colour, and material." },
  roles: { title: "Colour roles", body: "Every part has a role from the designer's renders: body, drawer inside, knobs, accent details, and the tyres (printed in TPU). Map each role to a filament you have." },
  kindRoles: { title: "Colour per part group", body: "Override a whole group, for example print every facade in the accent filament." },
  estimate: { title: "Estimate", body: "Where the designer's sheet has no number, every surface gets the shell thickness and the rest of the volume gets the infill fraction." },
};
