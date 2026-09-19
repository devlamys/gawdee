with open("frontend/src/app/products/[slug]/page.tsx", "r") as f:
    content = f.read()

# I need to insert the rich image sections right before Customer Reviews, inside the max-width: 800px area.

ui_old = """            {legacyInfo.ingredients && (
              <div style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '0.8rem', color: '#111' }}>Ingredients &amp; Sourcing</h3>
                <p style={{ color: '#555', lineHeight: 1.6 }}>{legacyInfo.ingredients}</p>
              </div>
            )}
          </div>
        </div>"""

ui_new = """            {legacyInfo.ingredients && (
              <div style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '0.8rem', color: '#111' }}>Ingredients &amp; Sourcing</h3>
                <p style={{ color: '#555', lineHeight: 1.6 }}>{legacyInfo.ingredients}</p>
              </div>
            )}
            
            {/* Rich Image Sections (Loop) */}
            {(() => {
              let sections = [];
              if (typeof item.rich_image_sections === 'string') {
                try { sections = JSON.parse(item.rich_image_sections); } catch(e) {}
              } else if (Array.isArray(item.rich_image_sections)) {
                sections = item.rich_image_sections;
              }
              if (!sections || sections.length === 0) return null;
              
              return (
                <div className="pv-rich-sections" style={{ marginTop: '3rem', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {sections.map((sec: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {sec.landscape && (
                        <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
                          <img src={sec.landscape.startsWith('/') ? sec.landscape : `/${sec.landscape}`} alt="" style={{ width: '100%', display: 'block', height: 'auto' }} />
                        </div>
                      )}
                      {(sec.portrait_1 || sec.portrait_2) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          {sec.portrait_1 ? (
                            <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
                              <img src={sec.portrait_1.startsWith('/') ? sec.portrait_1 : `/${sec.portrait_1}`} alt="" style={{ width: '100%', display: 'block', height: 'auto' }} />
                            </div>
                          ) : <div />}
                          {sec.portrait_2 ? (
                            <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
                              <img src={sec.portrait_2.startsWith('/') ? sec.portrait_2 : `/${sec.portrait_2}`} alt="" style={{ width: '100%', display: 'block', height: 'auto' }} />
                            </div>
                          ) : <div />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

          </div>
        </div>"""

content = content.replace(ui_old, ui_new)

with open("frontend/src/app/products/[slug]/page.tsx", "w") as f:
    f.write(content)
