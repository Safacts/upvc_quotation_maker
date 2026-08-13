import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'crafted_widget.dart';

class MarketPagePreviewScreen extends StatefulWidget {
  const MarketPagePreviewScreen({super.key});

  @override
  _MarketPagePreviewScreenState createState() =>
      _MarketPagePreviewScreenState();
}

class _MarketPagePreviewScreenState extends State<MarketPagePreviewScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _reviews = [];
  bool _isLoading = true;
  bool _isSaving = false;

  final _nameCtrl = TextEditingController();
  final _roleCtrl = TextEditingController();
  final _textCtrl = TextEditingController();
  int _rating = 5;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchReviews();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _nameCtrl.dispose();
    _roleCtrl.dispose();
    _textCtrl.dispose();
    super.dispose();
  }

  String get _baseUrl {
    // Dynamic per client: the public market page lives at app.vitharn.com/<slug>
    // where <slug> == the client id (kprupvc, venkateshwara, akshaya_upvc, ...).
    final slug = _clientId;
    if (kIsWeb) {
      final origin = Uri.base.origin;
      return origin.contains('localhost')
          ? '$origin/$slug'
          : 'https://app.vitharn.com/$slug';
    }
    return 'https://app.vitharn.com/$slug';
  }

  String get _clientId {
    return Provider.of<AppState>(context, listen: false).clientConfig.clientId;
  }

  Future<void> _fetchReviews() async {
    setState(() => _isLoading = true);
    try {
      final clientId = _clientId;
      final response = await SupabaseConfig.client
          .from('service_reviews')
          .select(
            'id,customer_name,role,rating,review_text,is_visible,source,created_at',
          )
          .eq('client_id', clientId)
          .order('created_at', ascending: false);
      setState(() {
        _reviews = List<Map<String, dynamic>>.from(response as List);
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      debugPrint('Fetch reviews error: $e');
    }
  }

  Future<void> _addReview() async {
    if (_nameCtrl.text.trim().isEmpty || _textCtrl.text.trim().isEmpty) return;
    setState(() => _isSaving = true);
    try {
      await SupabaseConfig.client.from('service_reviews').insert({
        'client_id': _clientId,
        'customer_name': _nameCtrl.text.trim(),
        'role': _roleCtrl.text.trim().isEmpty ? null : _roleCtrl.text.trim(),
        'rating': _rating,
        'review_text': _textCtrl.text.trim(),
        'source': 'manual',
        'is_visible': true,
      });
      _nameCtrl.clear();
      _roleCtrl.clear();
      _textCtrl.clear();
      _rating = 5;
      await _fetchReviews();
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Review added')));
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      setState(() => _isSaving = false);
    }
  }

  Future<void> _toggleVisibility(Map<String, dynamic> review) async {
    try {
      final newVal = !(review['is_visible'] == true);
      await SupabaseConfig.client
          .from('service_reviews')
          .update({'is_visible': newVal})
          .eq('id', review['id']);
      await _fetchReviews();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _deleteReview(Map<String, dynamic> review) async {
    try {
      await SupabaseConfig.client
          .from('service_reviews')
          .delete()
          .eq('id', review['id']);
      await _fetchReviews();
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Review deleted')));
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  void _showEditDialog(Map<String, dynamic> review) {
    final nameCtrl = TextEditingController(text: review['customer_name'] ?? '');
    final roleCtrl = TextEditingController(text: review['role'] ?? '');
    final textCtrl = TextEditingController(text: review['review_text'] ?? '');
    int rating = review['rating'] ?? 5;

    showDialog(
      context: context,
      builder:
          (ctx) => StatefulBuilder(
            builder:
                (ctx, setDialogState) => AlertDialog(
                  title: const Text('Edit Review'),
                  content: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextField(
                          controller: nameCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Customer Name',
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: roleCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Role (optional)',
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: textCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Review Text',
                          ),
                          maxLines: 3,
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            const Text('Rating: '),
                            ...List.generate(
                              5,
                              (i) => IconButton(
                                icon: Icon(
                                  i < rating ? Icons.star : Icons.star_border,
                                  color: Colors.amber,
                                ),
                                onPressed:
                                    () => setDialogState(() => rating = i + 1),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancel'),
                    ),
                    ElevatedButton(
                      onPressed: () async {
                        try {
                          await SupabaseConfig.client
                              .from('service_reviews')
                              .update({
                                'customer_name': nameCtrl.text.trim(),
                                'role':
                                    roleCtrl.text.trim().isEmpty
                                        ? null
                                        : roleCtrl.text.trim(),
                                'review_text': textCtrl.text.trim(),
                                'rating': rating,
                              })
                              .eq('id', review['id']);
                          Navigator.pop(ctx);
                          await _fetchReviews();
                          if (mounted)
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Review updated')),
                            );
                        } catch (e) {
                          if (mounted)
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Error: $e')),
                            );
                        }
                      },
                      child: const Text('Save'),
                    ),
                  ],
                ),
          ),
    );
  }

  Widget _buildPreviewTab() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          color: Colors.blue.shade50,
          child: Row(
            children: [
              const Icon(Icons.visibility, color: Colors.blue, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Preview: $_baseUrl',
                  style: TextStyle(color: Colors.blue.shade700, fontSize: 12),
                ),
              ),
              TextButton.icon(
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Open'),
                onPressed: () async {
                  final ok = await launchUrl(
                    Uri.parse(_baseUrl),
                    mode: LaunchMode.externalApplication,
                  );
                  if (!ok && mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Could not open market page'),
                      ),
                    );
                  }
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              children: [
                _buildPreviewCard(
                  'Hero Section',
                  'Company name, tagline, CTA buttons',
                ),
                _buildPreviewCard(
                  'Services',
                  '6 service cards with images (UPVC Windows, Doors, Structural Glazing, etc.)',
                ),
                _buildPreviewCard(
                  'About',
                  'Company description and trust indicators',
                ),
                _buildPreviewCard(
                  'Testimonials',
                  '${_reviews.where((r) => r['is_visible'] == true).length} visible reviews (managed below)',
                ),
                _buildPreviewCard(
                  'Projects / Gallery',
                  'Project images and descriptions',
                ),
                _buildPreviewCard('Process', 'How it works steps'),
                _buildPreviewCard('FAQ', 'Frequently asked questions'),
                _buildPreviewCard('Contact', 'Contact form and map'),
                _buildPreviewCard('Footer', 'Links, social, copyright'),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPreviewCard(String title, String subtitle) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        leading: const Icon(Icons.web, color: Colors.indigo),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      ),
    );
  }

  Widget _buildManageTab() {
    return Column(
      children: [
        _buildAddReviewForm(),
        const Divider(),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Text(
                'Reviews',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              const Spacer(),
              Text(
                '${_reviews.length} total',
                style: TextStyle(color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
        Expanded(
          child:
              _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _reviews.isEmpty
                  ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.rate_review_outlined,
                          size: 48,
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'No reviews yet',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  )
                  : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: _reviews.length,
                    itemBuilder: (ctx, i) {
                      final r = _reviews[i];
                      final visible = r['is_visible'] == true;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      r['customer_name'] ?? '',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  if (r['role'] != null &&
                                      r['role'].toString().isNotEmpty)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade200,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        r['role'],
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  ...List.generate(
                                    5,
                                    (si) => Icon(
                                      si < (r['rating'] ?? 0)
                                          ? Icons.star
                                          : Icons.star_border,
                                      size: 16,
                                      color: Colors.amber,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    r['source'] == 'seed'
                                        ? 'Seeded'
                                        : (r['source'] ?? 'manual'),
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade500,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                r['review_text'] ?? '',
                                style: const TextStyle(fontSize: 14),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  IconButton(
                                    icon: Icon(
                                      visible
                                          ? Icons.visibility
                                          : Icons.visibility_off,
                                      size: 20,
                                      color:
                                          visible ? Colors.green : Colors.grey,
                                    ),
                                    tooltip:
                                        visible
                                            ? 'Visible — click to hide'
                                            : 'Hidden — click to show',
                                    onPressed: () => _toggleVisibility(r),
                                  ),
                                  IconButton(
                                    icon: const Icon(
                                      Icons.edit,
                                      size: 20,
                                      color: Colors.blue,
                                    ),
                                    onPressed: () => _showEditDialog(r),
                                  ),
                                  IconButton(
                                    icon: const Icon(
                                      Icons.delete,
                                      size: 20,
                                      color: Colors.red,
                                    ),
                                    onPressed:
                                        () => showDialog(
                                          context: context,
                                          builder:
                                              (ctx) => AlertDialog(
                                                title: const Text(
                                                  'Delete Review?',
                                                ),
                                                content: Text(
                                                  'Delete review from ${r['customer_name']}?',
                                                ),
                                                actions: [
                                                  TextButton(
                                                    onPressed:
                                                        () =>
                                                            Navigator.pop(ctx),
                                                    child: const Text('Cancel'),
                                                  ),
                                                  ElevatedButton(
                                                    style:
                                                        ElevatedButton.styleFrom(
                                                          backgroundColor:
                                                              Colors.red,
                                                        ),
                                                    onPressed: () {
                                                      Navigator.pop(ctx);
                                                      _deleteReview(r);
                                                    },
                                                    child: const Text('Delete'),
                                                  ),
                                                ],
                                              ),
                                        ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    r['created_at'] != null
                                        ? DateFormat('MMM dd, yyyy').format(
                                          DateTime.parse(r['created_at']),
                                        )
                                        : '',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade500,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
        ),
      ],
    );
  }

  Widget _buildAddReviewForm() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.grey.shade50,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Add New Review',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nameCtrl,
            decoration: const InputDecoration(
              labelText: 'Customer Name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _roleCtrl,
            decoration: const InputDecoration(
              labelText: 'Role (optional, e.g. Architect)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _textCtrl,
            decoration: const InputDecoration(
              labelText: 'Review Text',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Rating: '),
              ...List.generate(
                5,
                (i) => IconButton(
                  icon: Icon(
                    i < _rating ? Icons.star : Icons.star_border,
                    color: Colors.amber,
                  ),
                  onPressed: () => setState(() => _rating = i + 1),
                ),
              ),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: _isSaving ? null : _addReview,
                icon:
                    _isSaving
                        ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                        : const Icon(Icons.add),
                label: const Text('Add Review'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final config = Provider.of<AppState>(context).clientConfig;
    final companyName = config.appName;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Market Page Preview',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            Text(
              companyName,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.normal,
              ),
            ),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.visibility), text: 'Preview'),
            Tab(icon: Icon(Icons.rate_review), text: 'Testimonials'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [_buildPreviewTab(), _buildManageTab()],
      ),
      bottomNavigationBar: CraftedWithLoveWidget(),
    );
  }
}
