
INSERT INTO public.service_categories (slug, name, description, sort_order, active) VALUES
  ('branding', 'Branding', 'Logo, huisstijl en merkidentiteit', 5, true),
  ('grafisch-ontwerp', 'Grafisch Ontwerp', 'Print- en digitaal ontwerp', 6, true),
  ('marketingstrategie', 'Marketingstrategie', 'Strategie, advies en planning', 7, true),
  ('drukwerk', 'Drukwerk', 'Visitekaartjes, flyers, brochures, banners', 8, true),
  ('content-productie', 'Content Productie', 'Posts, reels, captions, copywriting', 9, true),
  ('bedrijfspromotie', 'Bedrijfspromotie', 'Campagnes en advertenties', 10, true),
  ('relatiegeschenken', 'Relatiegeschenken & Merchandise', 'Bedrukte gadgets en merchandise', 11, true)
ON CONFLICT (slug) DO NOTHING;

-- Storage policies for quote-uploads bucket
CREATE POLICY "Anyone can upload to quote-uploads pending"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'quote-uploads' AND (storage.foldername(name))[1] = 'pending');

CREATE POLICY "Admins can read quote-uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-uploads' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete quote-uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quote-uploads' AND public.has_role(auth.uid(), 'admin'));
