import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'upvc_window_calculator.dart';
import 'glass_weight_calculator.dart';
import 'gst_calculator.dart';
import 'upi_qr_generator.dart';

/// Free Tools Hub — Landing page for all free calculators and generators.
/// 
/// This is the marketing MVP: a suite of free tools that uPVC businesses
/// can use without logging in. Designed for SEO and lead generation.
class FreeToolsHub extends StatelessWidget {
  const FreeToolsHub({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Hero Header
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            backgroundColor: primaryColor,
            flexibleSpace: FlexibleSpaceBar(
              title: const Text(
                'Free Tools',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      primaryColor,
                      primaryColor.withValues(alpha: 0.7),
                      theme.colorScheme.secondary,
                    ],
                  ),
                ),
                child: Center(
                  child: Icon(
                    Icons.build_circle_rounded,
                    size: 80,
                    color: Colors.white.withValues(alpha: 0.3),
                  ).animate().fadeIn(duration: 600.ms).scale(
                        begin: const Offset(0.8, 0.8),
                        end: const Offset(1.0, 1.0),
                      ),
                ),
              ),
            ),
          ),

          // Subtitle
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
              child: Column(
                children: [
                  Text(
                    'Free Calculators for uPVC Professionals',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: primaryColor,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Estimate costs, calculate weights, compute GST, and generate UPI QR codes — all free, no sign-up required.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.textTheme.bodySmall?.color,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),

          // Tool Cards
          SliverPadding(
            padding: const EdgeInsets.all(20),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _ToolCard(
                  icon: Icons.window_rounded,
                  title: 'uPVC Window Calculator',
                  subtitle: 'Estimate window costs by dimensions & type',
                  color: const Color(0xFF6366F1),
                  delay: 0,
                  onTap: () => _navigate(context, const UpvcWindowCalculator()),
                ),
                const SizedBox(height: 16),
                _ToolCard(
                  icon: Icons.grid_view_rounded,
                  title: 'Glass Weight Calculator',
                  subtitle: 'Calculate glass panel weight for safe handling',
                  color: const Color(0xFF06B6D4),
                  delay: 100,
                  onTap: () => _navigate(context, const GlassWeightCalculator()),
                ),
                const SizedBox(height: 16),
                _ToolCard(
                  icon: Icons.calculate_rounded,
                  title: 'GST Calculator',
                  subtitle: 'Compute CGST, SGST & total for uPVC billing',
                  color: const Color(0xFF10B981),
                  delay: 200,
                  onTap: () => _navigate(context, const GstCalculator()),
                ),
                const SizedBox(height: 16),
                _ToolCard(
                  icon: Icons.qr_code_2_rounded,
                  title: 'UPI QR Generator',
                  subtitle: 'Create payment QR codes with your UPI ID',
                  color: const Color(0xFFF59E0B),
                  delay: 300,
                  onTap: () => _navigate(context, const UpiQrGenerator()),
                ),
                const SizedBox(height: 32),

                // CTA Banner
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        primaryColor.withValues(alpha: 0.1),
                        theme.colorScheme.secondary.withValues(alpha: 0.05),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: primaryColor.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Column(
                    children: [
                      Icon(
                        Icons.auto_awesome_rounded,
                        size: 40,
                        color: primaryColor,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Want more powerful tools?',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Get the full uPVC Quotation Maker app with PDF export, customer management, and professional invoices.',
                        style: theme.textTheme.bodyMedium,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 600.ms, delay: 400.ms).slideY(
                      begin: 0.2,
                      end: 0,
                    ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _navigate(BuildContext context, Widget screen) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => screen),
    );
  }
}

/// Individual tool card widget with icon, description, and navigation.
class _ToolCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final int delay;
  final VoidCallback onTap;

  const _ToolCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.delay,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 12,
      shadowColor: color.withValues(alpha: 0.3),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              // Icon container
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      color,
                      color.withValues(alpha: 0.7),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(icon, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 16),
              // Text content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).textTheme.bodySmall?.color,
                          ),
                    ),
                  ],
                ),
              ),
              // Arrow
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 18,
                color: color,
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(duration: 500.ms, delay: Duration(milliseconds: delay)).slideX(
          begin: 0.1,
          end: 0,
        );
  }
}
