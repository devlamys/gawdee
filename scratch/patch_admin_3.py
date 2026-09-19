with open("frontend/src/app/admin/page.tsx", "r") as f:
    content = f.read()

# 1. Update payload
payload_old = """                    is_active: modalData.is_active ? 1 : 0,
                    variants: rows.map((v: any) => ({"""
payload_new = """                    is_active: modalData.is_active ? 1 : 0,
                    rich_image_sections: modalData.rich_image_sections || [],
                    variants: rows.map((v: any) => ({"""
content = content.replace(payload_old, payload_new)

# 2. Add UI section
ui_old = """                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>"""

ui_new = """                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 3: RICH IMAGE SECTIONS */}
              <div style={{ background: '#fff', border: '1px solid #e1e7e2', borderRadius: '14px', padding: '18px', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#005c4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ph ph-image"></i> 3. Rich Image Sections (Loop)
                    </h4>
                    <small style={{ color: '#77887e', fontSize: '0.65rem' }}>
                      Add sections of images (1 landscape, 2 portraits) for the product page.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    style={{ fontSize: '0.68rem', padding: '6px 12px' }}
                    onClick={() => {
                      const sections = modalData.rich_image_sections || [];
                      setModalData({ ...modalData, rich_image_sections: [...sections, { landscape: '', portrait_1: '', portrait_2: '' }] });
                    }}
                  >
                    <i className="ph ph-plus"></i> Add Section
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(modalData.rich_image_sections || []).map((sec: any, idx: number) => (
                    <div key={idx} style={{ padding: '16px', background: '#fbfcfb', border: '1px solid #e1e7e2', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <strong>Section {idx + 1}</strong>
                        <button
                          type="button"
                          className="admin-action-icon admin-action-icon--danger"
                          onClick={() => {
                            const newSec = [...modalData.rich_image_sections];
                            newSec.splice(idx, 1);
                            setModalData({ ...modalData, rich_image_sections: newSec });
                          }}
                        >
                          <i className="ph ph-trash"></i>
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        {/* Landscape */}
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Landscape Image</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {sec.landscape && <img src={sec.landscape} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                            <label className="admin-button admin-button--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                              <i className="ph ph-upload-simple"></i> Upload
                              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadImage(file, (url) => {
                                    const newSec = [...modalData.rich_image_sections];
                                    newSec[idx].landscape = url;
                                    setModalData({ ...modalData, rich_image_sections: newSec });
                                  });
                                }
                              }} />
                            </label>
                          </div>
                        </div>
                        {/* Portrait 1 */}
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Portrait 1 (Left)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {sec.portrait_1 && <img src={sec.portrait_1} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                            <label className="admin-button admin-button--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                              <i className="ph ph-upload-simple"></i> Upload
                              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadImage(file, (url) => {
                                    const newSec = [...modalData.rich_image_sections];
                                    newSec[idx].portrait_1 = url;
                                    setModalData({ ...modalData, rich_image_sections: newSec });
                                  });
                                }
                              }} />
                            </label>
                          </div>
                        </div>
                        {/* Portrait 2 */}
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Portrait 2 (Right)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {sec.portrait_2 && <img src={sec.portrait_2} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                            <label className="admin-button admin-button--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                              <i className="ph ph-upload-simple"></i> Upload
                              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadImage(file, (url) => {
                                    const newSec = [...modalData.rich_image_sections];
                                    newSec[idx].portrait_2 = url;
                                    setModalData({ ...modalData, rich_image_sections: newSec });
                                  });
                                }
                              }} />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!modalData.rich_image_sections || modalData.rich_image_sections.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '24px', background: '#fbfcfb', border: '1px dashed #e1e7e2', borderRadius: '8px', color: '#77887e', fontSize: '0.8rem' }}>
                      No image sections added yet. Click &quot;Add Section&quot; to begin.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>"""

content = content.replace(ui_old, ui_new)

with open("frontend/src/app/admin/page.tsx", "w") as f:
    f.write(content)

