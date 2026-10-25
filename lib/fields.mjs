// The site's field list, written once. The site's reader rejects any frontmatter key or settings key
// that is not named here, and the exporter generates the Pages CMS settings file from the same list,
// so what the editor offers and what the site reads cannot drift apart.
//   type: string | text | rich-text | number | image
//   list: true for a list of values; fields: for a list of objects
//   hidden: true for generated fields the editor should not show
export const fields = {
  pages: [
    { name: 'title', label: 'Title', type: 'string' },
    { name: 'seoTitle', label: 'Search title', type: 'string' },
    { name: 'seoDescription', label: 'Search description', type: 'text' },
    { name: 'route', label: 'Address', type: 'string', hidden: true },
    { name: 'sourceUrl', label: 'Original address', type: 'string', hidden: true },
    { name: 'createdAt', label: 'Created', type: 'string', hidden: true },
    { name: 'updatedAt', label: 'Updated', type: 'string', hidden: true },
    { name: 'publishedAt', label: 'Published', type: 'string', hidden: true },
  ],
  posts: [
    { name: 'title', label: 'Title', type: 'string' },
    { name: 'seoTitle', label: 'Search title', type: 'string' },
    { name: 'seoDescription', label: 'Search description', type: 'text' },
    { name: 'route', label: 'Address', type: 'string', hidden: true },
    { name: 'sourceUrl', label: 'Original address', type: 'string', hidden: true },
    { name: 'publishedAt', label: 'Published', type: 'string', hidden: true },
    { name: 'createdAt', label: 'Created', type: 'string', hidden: true },
    { name: 'updatedAt', label: 'Updated', type: 'string', hidden: true },
    { name: 'categories', label: 'Categories', type: 'string', list: true },
    { name: 'heroImage', label: 'Main photo', type: 'image' },
  ],
  instructors: [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'role', label: 'Role', type: 'string' },
    { name: 'credentials', label: 'Credentials', type: 'string' },
    { name: 'photo', label: 'Photo', type: 'image' },
    { name: 'photoAlt', label: 'Photo description', type: 'string' },
    { name: 'order', label: 'Order', type: 'number' },
  ],
  studio: [
    { name: 'hours', label: 'Hours', type: 'text' },
    { name: 'phone', label: 'Phone', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'address', label: 'Address', type: 'text' },
    { name: 'bookingUrl', label: 'Booking link', type: 'string' },
  ],
  site: [
    { name: 'siteName', label: 'Site name', type: 'string' },
    { name: 'canonicalBase', label: 'Web address', type: 'string' },
    {
      name: 'nav',
      label: 'Menu',
      type: 'object',
      list: true,
      fields: [
        { name: 'label', label: 'Label', type: 'string' },
        { name: 'href', label: 'Link', type: 'string' },
      ],
    },
    {
      name: 'footer',
      label: 'Footer links',
      type: 'object',
      list: true,
      fields: [
        { name: 'label', label: 'Label', type: 'string' },
        { name: 'href', label: 'Link', type: 'string' },
      ],
    },
  ],
}

/** Frontmatter and settings keys the site's reader accepts for a collection or file. */
export const allowedKeys = (name) => (fields[name] ?? []).map((f) => f.name)
