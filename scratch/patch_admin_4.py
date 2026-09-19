with open("frontend/src/app/admin/page.tsx", "r") as f:
    content = f.read()

old_edit = """                                description: p.description || '',
                                is_active: p.isActive !== 0,
                                variants: (p.variants || []).map((v: any) => ({"""
new_edit = """                                description: p.description || '',
                                is_active: p.isActive !== 0,
                                rich_image_sections: (() => {
                                  try {
                                    const val = p.richImageSections || p.rich_image_sections;
                                    return typeof val === 'string' ? JSON.parse(val) : (val || []);
                                  } catch (e) { return []; }
                                })(),
                                variants: (p.variants || []).map((v: any) => ({"""
content = content.replace(old_edit, new_edit)

with open("frontend/src/app/admin/page.tsx", "w") as f:
    f.write(content)
