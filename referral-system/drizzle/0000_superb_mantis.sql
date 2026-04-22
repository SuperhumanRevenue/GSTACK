CREATE TYPE "public"."ask_type" AS ENUM('live', 'async', 'soft_seed');--> statement-breakpoint
CREATE TYPE "public"."customer_context_status" AS ENUM('intake', 'researching', 'generating', 'complete');--> statement-breakpoint
CREATE TYPE "public"."entity_relation_type" AS ENUM('parent_subsidiary', 'pe_portfolio', 'vc_portfolio', 'holding_company', 'joint_venture', 'strategic_partner');--> statement-breakpoint
CREATE TYPE "public"."funnel_stage" AS ENUM('top_awareness', 'mid_consideration', 'bottom_conversion');--> statement-breakpoint
CREATE TYPE "public"."pcp_analysis_status" AS ENUM('pending', 'analyzing', 'complete', 'stale');--> statement-breakpoint
CREATE TYPE "public"."pcp_tier" AS ENUM('power_law', 'high_value', 'core', 'long_tail');--> statement-breakpoint
CREATE TYPE "public"."readiness_tier" AS ENUM('hot', 'warm', 'not_yet');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('ask_pending', 'ask_sent', 'intro_pending', 'intro_sent', 'meeting_booked', 'opportunity_created', 'closed_won', 'closed_lost', 'deferred', 'expired', 'declined');--> statement-breakpoint
CREATE TYPE "public"."response_type" AS ENUM('yes', 'maybe', 'no', 'no_response', 'pending');--> statement-breakpoint
CREATE TYPE "public"."reward_category" AS ENUM('recognition', 'reciprocal', 'economic', 'access', 'co_marketing');--> statement-breakpoint
CREATE TYPE "public"."signal_channel" AS ENUM('dark_funnel', 'crm', 'website', 'product', 'community', 'open_source');--> statement-breakpoint
CREATE TYPE "public"."signal_strength" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."signal_tag" AS ENUM('sales_led', 'product_led', 'nearbound', 'event', 'competitor', 'community_led');--> statement-breakpoint
CREATE TYPE "public"."super_referrer_tier" AS ENUM('platinum', 'gold', 'silver', 'bronze');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crm_account_id" text,
	"company_name" text NOT NULL,
	"industry" text,
	"employee_count" integer,
	"current_acv" numeric(12, 2),
	"contract_start_date" timestamp,
	"renewal_date" timestamp,
	"tenure_months" integer,
	"cs_health_score" integer,
	"nps_score" integer,
	"last_qbr_date" timestamp,
	"last_qbr_outcome" text,
	"support_escalation_active" boolean DEFAULT false,
	"churn_risk_active" boolean DEFAULT false,
	"usage_trend" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "accounts_crm_account_id_unique" UNIQUE("crm_account_id")
);
--> statement-breakpoint
CREATE TABLE "champions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"email" text,
	"linkedin_url" text,
	"seniority_level" text,
	"relationship_strength" text,
	"is_executive_sponsor" boolean DEFAULT false,
	"former_companies" jsonb,
	"industry_communities" jsonb,
	"communication_style" text,
	"network_reach_score" integer,
	"last_interaction_date" timestamp,
	"departed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connection_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"champion_id" uuid NOT NULL,
	"target_company" text NOT NULL,
	"target_contact" text NOT NULL,
	"target_title" text NOT NULL,
	"target_linkedin_url" text,
	"connection_path" text NOT NULL,
	"connection_strength_score" integer,
	"target_account_priority" integer,
	"role_match_score" integer,
	"pain_alignment_score" integer,
	"timing_signal_score" integer,
	"composite_score" integer,
	"suggested_framing" text,
	"existing_relationship" text,
	"mapped_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "corporate_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_type" text NOT NULL,
	"industry" text,
	"website" text,
	"employee_count" integer,
	"linked_account_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_signal_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_context_id" uuid NOT NULL,
	"signal_template_id" uuid NOT NULL,
	"customized_name" text NOT NULL,
	"customized_description" text NOT NULL,
	"customized_playbook" text,
	"strength" "signal_strength" NOT NULL,
	"tag" "signal_tag" NOT NULL,
	"channel" "signal_channel" NOT NULL,
	"funnel_stage" "funnel_stage" NOT NULL,
	"relevance_score" integer NOT NULL,
	"example_triggers" jsonb,
	"active" boolean DEFAULT true,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"positioning" text,
	"messaging" text,
	"case_studies" jsonb,
	"master_deck_summary" text,
	"packaging" jsonb,
	"product_description" text,
	"target_industries" jsonb,
	"target_personas" jsonb,
	"competitors" jsonb,
	"tech_stack_adjacencies" jsonb,
	"market_research" jsonb,
	"status" "customer_context_status" DEFAULT 'intake',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entity_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_entity_id" uuid NOT NULL,
	"child_entity_id" uuid NOT NULL,
	"relation_type" "entity_relation_type" NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"source" text NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incentive_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"company_stage" text,
	"company_arr" numeric(14, 2),
	"company_industry" text,
	"avg_acv" numeric(12, 2),
	"acv_range_low" numeric(12, 2),
	"acv_range_high" numeric(12, 2),
	"current_outbound_cac" numeric(12, 2),
	"customer_count" integer,
	"champion_id" uuid,
	"referrer_seniority" text,
	"referrer_motivation" text,
	"super_referrer_tier" "super_referrer_tier",
	"reward_ceiling" numeric(12, 2),
	"annual_program_budget" numeric(12, 2),
	"primary_reward_category" "reward_category",
	"primary_reward_description" text,
	"primary_reward_cost" numeric(12, 2),
	"primary_reward_timing" text,
	"secondary_reward_category" "reward_category",
	"secondary_reward_description" text,
	"secondary_reward_cost" numeric(12, 2),
	"secondary_reward_timing" text,
	"ongoing_benefits" jsonb,
	"total_cost_per_referral" numeric(12, 2),
	"cac_savings_pct" numeric(5, 2),
	"escalation_path" jsonb,
	"language_to_use" text,
	"language_to_avoid" text,
	"edge_case_notes" text,
	"times_used" integer DEFAULT 0,
	"conversion_rate" numeric(5, 4),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pcp_account_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"tier" "pcp_tier" NOT NULL,
	"total_revenue" numeric(14, 2) NOT NULL,
	"revenue_pct_of_total" numeric(5, 2) NOT NULL,
	"revenue_rank" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pcp_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"period" text NOT NULL,
	"total_accounts" integer NOT NULL,
	"total_revenue" numeric(14, 2) NOT NULL,
	"power_law_threshold_pct" numeric(5, 2) DEFAULT '3',
	"power_law_account_count" integer NOT NULL,
	"power_law_revenue_pct" numeric(5, 2) NOT NULL,
	"high_value_account_count" integer NOT NULL,
	"high_value_revenue_pct" numeric(5, 2) NOT NULL,
	"core_account_count" integer NOT NULL,
	"core_revenue_pct" numeric(5, 2) NOT NULL,
	"long_tail_account_count" integer NOT NULL,
	"long_tail_revenue_pct" numeric(5, 2) NOT NULL,
	"gini_coefficient" numeric(5, 4),
	"status" "pcp_analysis_status" DEFAULT 'pending',
	"analyzed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pcp_icp_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"attribute" text NOT NULL,
	"attribute_value" text NOT NULL,
	"power_law_frequency" numeric(5, 4) NOT NULL,
	"overall_frequency" numeric(5, 4) NOT NULL,
	"lift_score" numeric(7, 4) NOT NULL,
	"weight" numeric(5, 4) NOT NULL,
	"sample_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolio_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_account_id" uuid NOT NULL,
	"target_company" text NOT NULL,
	"intermediary_entity_id" uuid,
	"connection_type" text NOT NULL,
	"connection_path" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"estimated_acv" numeric(12, 2),
	"rationale" text NOT NULL,
	"suggested_approach" text NOT NULL,
	"status" text DEFAULT 'identified',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "readiness_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"champion_id" uuid NOT NULL,
	"total_score" integer NOT NULL,
	"tier" "readiness_tier" NOT NULL,
	"value_delivered_score" integer NOT NULL,
	"relationship_strength_score" integer NOT NULL,
	"recency_of_win_score" integer NOT NULL,
	"network_value_score" integer NOT NULL,
	"ask_history_score" integer NOT NULL,
	"trigger_event" text,
	"trigger_date" timestamp,
	"anti_triggers" jsonb,
	"scoring_rationale" text,
	"scored_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referral_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid,
	"target_company" text NOT NULL,
	"target_contact" text NOT NULL,
	"target_title" text NOT NULL,
	"referred_by_champion_id" uuid,
	"icp_fit_score" integer,
	"pain_alignment_score" integer,
	"champion_credibility_score" integer,
	"timing_score" integer,
	"deal_size_score" integer,
	"total_target_score" integer,
	"priority" text,
	"scored_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"champion_id" uuid NOT NULL,
	"connection_map_id" uuid,
	"readiness_score_id" uuid,
	"target_company" text NOT NULL,
	"target_contact" text NOT NULL,
	"target_title" text NOT NULL,
	"ask_type" "ask_type" NOT NULL,
	"ask_date" timestamp,
	"ask_content" text,
	"trigger_event" text NOT NULL,
	"readiness_score_at_ask" integer,
	"response" "response_type" DEFAULT 'pending',
	"response_date" timestamp,
	"follow_up_count" integer DEFAULT 0,
	"last_follow_up_date" timestamp,
	"status" "referral_status" DEFAULT 'ask_pending',
	"intro_date" timestamp,
	"intro_content" text,
	"meeting_date" timestamp,
	"crm_opportunity_id" text,
	"opportunity_amount" numeric(12, 2),
	"closed_date" timestamp,
	"closed_amount" numeric(12, 2),
	"time_to_close_days" integer,
	"champion_reward" text,
	"reward_date" timestamp,
	"owning_ae" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period" text NOT NULL,
	"revenue" numeric(14, 2) NOT NULL,
	"deal_count" integer DEFAULT 1,
	"product_lines" jsonb,
	"expansion_revenue" numeric(14, 2),
	"referral_sourced" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signal_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_name" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"strength" "signal_strength" NOT NULL,
	"tag" "signal_tag" NOT NULL,
	"channel" "signal_channel" NOT NULL,
	"funnel_stage" "funnel_stage" NOT NULL,
	"has_playbook" boolean DEFAULT false,
	"playbook" text,
	"category_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "super_referrers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"champion_id" uuid NOT NULL,
	"super_score" integer NOT NULL,
	"tier" "super_referrer_tier" NOT NULL,
	"volume_score" integer NOT NULL,
	"quality_score" integer NOT NULL,
	"value_score" integer NOT NULL,
	"network_score" integer NOT NULL,
	"velocity_score" integer NOT NULL,
	"total_referrals" integer DEFAULT 0,
	"total_intros" integer DEFAULT 0,
	"total_meetings" integer DEFAULT 0,
	"total_closed" integer DEFAULT 0,
	"total_revenue" numeric(12, 2) DEFAULT '0',
	"avg_deal_size" numeric(12, 2),
	"avg_time_to_close" integer,
	"response_rate" numeric(5, 4),
	"last_referral_date" timestamp,
	"program_join_date" timestamp,
	"rewards_delivered" jsonb,
	"recalculated_at" timestamp DEFAULT now(),
	CONSTRAINT "super_referrers_champion_id_unique" UNIQUE("champion_id")
);
--> statement-breakpoint
CREATE TABLE "trigger_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"champion_id" uuid,
	"event_type" text NOT NULL,
	"event_category" text NOT NULL,
	"event_description" text NOT NULL,
	"event_date" timestamp NOT NULL,
	"data_source" text,
	"is_anti_trigger" boolean DEFAULT false,
	"processed_for_scoring" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_maps" ADD CONSTRAINT "connection_maps_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_entities" ADD CONSTRAINT "corporate_entities_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_signal_guides" ADD CONSTRAINT "custom_signal_guides_customer_context_id_customer_contexts_id_fk" FOREIGN KEY ("customer_context_id") REFERENCES "public"."customer_contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_signal_guides" ADD CONSTRAINT "custom_signal_guides_signal_template_id_signal_templates_id_fk" FOREIGN KEY ("signal_template_id") REFERENCES "public"."signal_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_parent_entity_id_corporate_entities_id_fk" FOREIGN KEY ("parent_entity_id") REFERENCES "public"."corporate_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_child_entity_id_corporate_entities_id_fk" FOREIGN KEY ("child_entity_id") REFERENCES "public"."corporate_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incentive_packages" ADD CONSTRAINT "incentive_packages_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_account_tiers" ADD CONSTRAINT "pcp_account_tiers_analysis_id_pcp_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."pcp_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_account_tiers" ADD CONSTRAINT "pcp_account_tiers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_icp_weights" ADD CONSTRAINT "pcp_icp_weights_analysis_id_pcp_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."pcp_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_opportunities" ADD CONSTRAINT "portfolio_opportunities_source_account_id_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_opportunities" ADD CONSTRAINT "portfolio_opportunities_intermediary_entity_id_corporate_entities_id_fk" FOREIGN KEY ("intermediary_entity_id") REFERENCES "public"."corporate_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_targets" ADD CONSTRAINT "referral_targets_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_targets" ADD CONSTRAINT "referral_targets_referred_by_champion_id_champions_id_fk" FOREIGN KEY ("referred_by_champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_connection_map_id_connection_maps_id_fk" FOREIGN KEY ("connection_map_id") REFERENCES "public"."connection_maps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_readiness_score_id_readiness_scores_id_fk" FOREIGN KEY ("readiness_score_id") REFERENCES "public"."readiness_scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ADD CONSTRAINT "revenue_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_referrers" ADD CONSTRAINT "super_referrers_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_events" ADD CONSTRAINT "trigger_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_events" ADD CONSTRAINT "trigger_events_champion_id_champions_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."champions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_industry" ON "accounts" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "idx_accounts_acv" ON "accounts" USING btree ("current_acv");--> statement-breakpoint
CREATE INDEX "idx_champions_account" ON "champions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_connections_champion" ON "connection_maps" USING btree ("champion_id");--> statement-breakpoint
CREATE INDEX "idx_connections_score" ON "connection_maps" USING btree ("composite_score");--> statement-breakpoint
CREATE INDEX "idx_corporate_entities_name" ON "corporate_entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_corporate_entities_type" ON "corporate_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_corporate_entities_linked_account" ON "corporate_entities" USING btree ("linked_account_id");--> statement-breakpoint
CREATE INDEX "idx_custom_signals_context" ON "custom_signal_guides" USING btree ("customer_context_id");--> statement-breakpoint
CREATE INDEX "idx_custom_signals_relevance" ON "custom_signal_guides" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "idx_custom_signals_active" ON "custom_signal_guides" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_customer_contexts_company" ON "customer_contexts" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "idx_customer_contexts_status" ON "customer_contexts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_entity_relationships_parent" ON "entity_relationships" USING btree ("parent_entity_id");--> statement-breakpoint
CREATE INDEX "idx_entity_relationships_child" ON "entity_relationships" USING btree ("child_entity_id");--> statement-breakpoint
CREATE INDEX "idx_entity_relationships_type" ON "entity_relationships" USING btree ("relation_type");--> statement-breakpoint
CREATE INDEX "idx_incentive_champion" ON "incentive_packages" USING btree ("champion_id");--> statement-breakpoint
CREATE INDEX "idx_incentive_company" ON "incentive_packages" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "idx_pcp_account_tiers_analysis" ON "pcp_account_tiers" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "idx_pcp_account_tiers_tier" ON "pcp_account_tiers" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "idx_pcp_account_tiers_account" ON "pcp_account_tiers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_pcp_analyses_status" ON "pcp_analyses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pcp_icp_weights_analysis" ON "pcp_icp_weights" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "idx_pcp_icp_weights_attribute" ON "pcp_icp_weights" USING btree ("attribute");--> statement-breakpoint
CREATE INDEX "idx_pcp_icp_weights_lift" ON "pcp_icp_weights" USING btree ("lift_score");--> statement-breakpoint
CREATE INDEX "idx_portfolio_opps_source" ON "portfolio_opportunities" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "idx_portfolio_opps_status" ON "portfolio_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_portfolio_opps_confidence" ON "portfolio_opportunities" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_readiness_account" ON "readiness_scores" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_readiness_tier" ON "readiness_scores" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "idx_readiness_score" ON "readiness_scores" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "idx_referrals_account" ON "referrals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_champion" ON "referrals" USING btree ("champion_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_status" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_referrals_ask_date" ON "referrals" USING btree ("ask_date");--> statement-breakpoint
CREATE INDEX "idx_revenue_snapshots_account" ON "revenue_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_revenue_snapshots_period" ON "revenue_snapshots" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_signal_templates_tag" ON "signal_templates" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "idx_signal_templates_strength" ON "signal_templates" USING btree ("strength");--> statement-breakpoint
CREATE INDEX "idx_super_referrers_score" ON "super_referrers" USING btree ("super_score");--> statement-breakpoint
CREATE INDEX "idx_super_referrers_tier" ON "super_referrers" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "idx_trigger_events_account" ON "trigger_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_trigger_events_date" ON "trigger_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "idx_trigger_events_type" ON "trigger_events" USING btree ("event_type");