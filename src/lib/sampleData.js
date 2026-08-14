// Onboarding sandbox: seed and remove a coherent set of clearly-labeled example records so a new
// tenant can explore the client -> project -> estimate flow, then wipe it. Everything created is
// tagged is_sample, and removal only ever touches is_sample rows, so real data is never affected.
import { base44 } from '@/api/base44Client';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// One estimate line item in the shape the builder expects.
function li(category, description, unit, quantity, unit_cost) {
  return {
    id: uuid(), category, description, item_description: description,
    unit, quantity, unit_cost, line_total: Math.round(quantity * unit_cost * 100) / 100,
    markup_pct: 0, labor_auto: false, labor_cost_per_unit: 0,
    cost_code: '', cost_code_id: '', linked_section_id: null,
  };
}

export async function countSampleData() {
  const [clients, projects, estimates] = await Promise.all([
    base44.entities.Client.filter({ is_sample: true }),
    base44.entities.Project.filter({ is_sample: true }),
    base44.entities.Estimate.filter({ is_sample: true }),
  ]);
  return { clients: clients.length, projects: projects.length, estimates: estimates.length,
    total: clients.length + projects.length + estimates.length };
}

export async function seedSampleData() {
  const client = await base44.entities.Client.create({
    name: 'Rivera Household (example)', contact_name: 'Maria Rivera',
    email: 'maria.rivera@example.com', phone: '(555) 010-4827',
    billing_address: '128 Example Ave', city: 'Springfield', state: 'MO', zip: '65804',
    status: 'active', notes: 'Sample client, safe to delete.', is_sample: true,
  });

  const project = await base44.entities.Project.create({
    name: '128 Example Ave — Kitchen Remodel', address: '128 Example Ave, Springfield, MO 65804',
    client_name: client.name, status: 'active', phase: 'Estimating',
    budget: 16410, notes: 'Sample project, safe to delete.', color: '#B58A45',
    invoice_prefix: '128Example', is_sample: true,
  });

  const sections = [
    { id: uuid(), name: '1.0 Demolition & Prep', line_items: [
      li('subcontractor', '30 yard dumpster', 'Ea', 1, 450),
      li('labor', 'Demo existing kitchen', 'Hr', 24, 65),
    ] },
    { id: uuid(), name: '2.0 Kitchen Build', line_items: [
      li('materials', 'Cabinets, shaker style', 'Ls', 1, 6800),
      li('materials', 'Quartz countertops', 'Ls', 1, 3200),
      li('labor', 'Install cabinets & counters', 'Hr', 40, 65),
      li('subcontractor', 'Electrical rough-in & finish', 'Ls', 1, 1800),
    ] },
  ];
  const grand = sections.reduce((s, sec) => s + sec.line_items.reduce((a, i) => a + i.line_total, 0), 0);

  const estimate = await base44.entities.Estimate.create({
    title: '128 Example Ave — Kitchen Remodel', status: 'draft',
    client_id: client.id, client_name: client.name, client_email: client.email,
    project_id: project.id, project_name: project.name,
    estimate_number: 'EXAMPLE-001', notes: 'Sample estimate. Explore it, then convert to an invoice, or remove the example data anytime.',
    sections, subtotal: grand, total_markup: 0, grand_total: grand,
    gc_fee_enabled: false, category_markups: { labor: 0, materials: 0, subcontractor: 0, other: 0 },
    is_sample: true,
  });

  return { clientId: client.id, projectId: project.id, estimateId: estimate.id };
}

export async function removeSampleData() {
  // Estimates first (they reference the sample project and client), then projects, then clients.
  const estimates = await base44.entities.Estimate.filter({ is_sample: true });
  for (const e of estimates) await base44.entities.Estimate.delete(e.id);
  const projects = await base44.entities.Project.filter({ is_sample: true });
  for (const p of projects) await base44.entities.Project.delete(p.id);
  const clients = await base44.entities.Client.filter({ is_sample: true });
  for (const c of clients) await base44.entities.Client.delete(c.id);
  return { removed: estimates.length + projects.length + clients.length };
}
