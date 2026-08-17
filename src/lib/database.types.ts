export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      businesses: { Row: Business; Insert: BusinessInsert; Update: BusinessUpdate; Relationships: [] };
      users: { Row: User; Insert: UserInsert; Update: UserUpdate; Relationships: [] };
      parties: { Row: Party; Insert: PartyInsert; Update: PartyUpdate; Relationships: [] };
      items: { Row: Item; Insert: ItemInsert; Update: ItemUpdate; Relationships: [] };
      units: { Row: Unit; Insert: UnitInsert; Update: UnitUpdate; Relationships: [] };
      taxes: { Row: Tax; Insert: TaxInsert; Update: TaxUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'owner' | 'manager' | 'accountant' | 'salesperson';
      party_type: 'customer' | 'supplier' | 'both';
      item_type: 'product' | 'service' | 'raw_material' | 'finished_good';
    };
    CompositeTypes: Record<string, never>;
  };
};

export interface Business { id: string; name: string; legal_name: string; slug: string; email: string; phone: string; gstin: string; address: string; state: string; state_code: string; currency: string; timezone: string; settings: Json; is_active: boolean; created_at: string; updated_at: string }
export type BusinessInsert = Partial<Omit<Business, 'id' | 'created_at' | 'updated_at'>> & Pick<Business, 'id' | 'slug'>;
export type BusinessUpdate = Partial<BusinessInsert>;
export interface User { id: string; business_id: string; auth_user_id: string | null; email: string; full_name: string; role: Database['public']['Enums']['user_role']; phone: string; is_active: boolean; last_seen_at: string | null; created_at: string; updated_at: string }
export type UserInsert = Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> & Pick<User, 'business_id' | 'email'>;
export type UserUpdate = Partial<UserInsert>;
export interface Party { id: string; business_id: string; name: string; party_type: Database['public']['Enums']['party_type']; company_name: string; phone: string; email: string; address: string; city: string; state: string; state_code: string; pincode: string; gstin: string; pan: string; opening_balance: number; opening_balance_type: 'none' | 'debit' | 'credit'; credit_limit: number; payment_terms_days: number; notes: string; is_active: boolean; deleted_at: string | null; created_at: string; updated_at: string }
export type PartyInsert = Partial<Omit<Party, 'id' | 'created_at' | 'updated_at'>> & Pick<Party, 'business_id' | 'name'>;
export type PartyUpdate = Partial<PartyInsert>;
export interface Unit { id: string; business_id: string | null; code: string; name: string; symbol: string; decimal_places: number; is_system: boolean; is_active: boolean; created_at: string; updated_at: string }
export type UnitInsert = Partial<Omit<Unit, 'id' | 'created_at' | 'updated_at'>> & Pick<Unit, 'code' | 'name' | 'symbol'>;
export type UnitUpdate = Partial<UnitInsert>;
export interface Tax { id: string; business_id: string | null; name: string; code: string; rate: number; tax_type: 'gst' | 'igst' | 'exempt' | 'none'; cgst_rate: number; sgst_rate: number; igst_rate: number; is_system: boolean; is_active: boolean; created_at: string; updated_at: string }
export type TaxInsert = Partial<Omit<Tax, 'id' | 'created_at' | 'updated_at'>> & Pick<Tax, 'name' | 'code'>;
export type TaxUpdate = Partial<TaxInsert>;
export interface Item { id: string; business_id: string; sku: string; name: string; description: string; category: string; item_type: Database['public']['Enums']['item_type']; unit_id: string | null; tax_id: string | null; hsn_code: string; selling_price: number; purchase_price: number; min_stock: number; profile_system: string; colour: string; glass_specification: string; reinforcement: string; frame_series: string; fabrication_parameters: Json; is_active: boolean; deleted_at: string | null; created_at: string; updated_at: string }
export type ItemInsert = Partial<Omit<Item, 'id' | 'created_at' | 'updated_at'>> & Pick<Item, 'business_id' | 'name'>;
export type ItemUpdate = Partial<ItemInsert>;
