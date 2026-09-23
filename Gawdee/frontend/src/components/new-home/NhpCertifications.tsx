const CERTS = [
  { icon: 'ph-seal-check', label: 'FSSAI Lic. 10821005000' },
  { icon: 'ph-flask-conical', label: 'NABL Accredited Tested' },
  { icon: 'ph-factory', label: 'GMP Good Mfg Practice' },
  { icon: 'ph-leaf', label: 'Non-GMO Verified' },
  { icon: 'ph-sprout', label: 'Jaivik Bharat Standard' },
];

/**
 * Phase 8 — Certifications row. Static, no backend call. Server Component.
 */
export function NhpCertifications() {
  return (
    <section className="nhp-certifications" aria-label="Certified by premier food authorities">
      <p className="nhp-certifications__heading">Certified & Approved by Premier Food Authorities</p>
      <ul className="nhp-certifications__list">
        {CERTS.map((cert) => (
          <li key={cert.label}>
            <i className={`ph ${cert.icon}`} aria-hidden="true"></i>
            {cert.label}
          </li>
        ))}
      </ul>
    </section>
  );
}